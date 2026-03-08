// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/ILiquidityPool.sol";

/**
 * @title LiquidityPool
 * @author Hamzy
 * @notice ERC-20 LP token representing a share of a two-token liquidity pool.
 *         Implements a constant-product AMM (x * y = k) with 0.3% swap fee.
 *         LP tokens are minted proportionally on deposit and burned on withdrawal.
 * @dev The pool itself handles token transfers and reserve accounting.
 *      Only the authorised router (ArcSwap) can call mint/burn/swap.
 */
contract LiquidityPool is ILiquidityPool, ERC20, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────────────────────

    /// @notice Minimum liquidity locked permanently to prevent division by zero
    uint256 public constant MINIMUM_LIQUIDITY = 1000;

    /// @notice Swap fee: 0.3% expressed as 3 / 1000
    uint256 public constant FEE_NUMERATOR = 3;
    uint256 public constant FEE_DENOMINATOR = 1000;

    // ─────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────

    /// @notice Token A in this pair
    address public immutable tokenA;
    /// @notice Token B in this pair
    address public immutable tokenB;

    /// @notice Current reserve of token A
    uint112 private _reserveA;
    /// @notice Current reserve of token B
    uint112 private _reserveB;
    /// @notice Last block timestamp when reserves were updated
    uint32  private _blockTimestampLast;

    /// @notice Cumulative price of A in terms of B (for TWAP oracle)
    uint256 public price0CumulativeLast;
    /// @notice Cumulative price of B in terms of A (for TWAP oracle)
    uint256 public price1CumulativeLast;

    /// @notice Last value of k (reserve0 * reserve1) — used for fee tracking
    uint256 public kLast;

    /// @notice Total swap fees earned in token A units (18 decimal equivalent)
    uint256 public totalFeesEarnedA;
    /// @notice Total swap fees earned in token B units
    uint256 public totalFeesEarnedB;

    /// @notice Authorised router that can call privileged functions
    address public router;

    // ─────────────────────────────────────────────────────────────
    // Events (in addition to ILiquidityPool)
    // ─────────────────────────────────────────────────────────────

    event RouterSet(address indexed router);
    event Sync(uint112 reserveA, uint112 reserveB);

    // ─────────────────────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────────────────────

    modifier onlyRouter() {
        require(msg.sender == router, "LiquidityPool: caller is not router");
        _;
    }

    // ─────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────

    /**
     * @param _tokenA       Address of token A
     * @param _tokenB       Address of token B
     * @param initialOwner  Owner (typically the deployer / factory)
     */
    constructor(
        address _tokenA,
        address _tokenB,
        address initialOwner
    )
        ERC20(
            string(abi.encodePacked("ArcSwap LP: ", _tokenSymbol(_tokenA), "/", _tokenSymbol(_tokenB))),
            string(abi.encodePacked("HLP-", _tokenSymbol(_tokenA), "-", _tokenSymbol(_tokenB)))
        )
        Ownable(initialOwner)
    {
        require(_tokenA != address(0) && _tokenB != address(0), "LiquidityPool: zero address");
        require(_tokenA != _tokenB, "LiquidityPool: identical tokens");

        // Ensure canonical ordering so the same pair always has the same address
        if (_tokenA > _tokenB) {
            tokenA = _tokenB;
            tokenB = _tokenA;
        } else {
            tokenA = _tokenA;
            tokenB = _tokenB;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────────

    /**
     * @notice Set the authorised router address. Can only be set once.
     * @param _router Address of the ArcSwap router
     */
    function setRouter(address _router) external onlyOwner {
        require(_router != address(0), "LiquidityPool: zero router");
        require(router == address(0), "LiquidityPool: router already set");
        router = _router;
        emit RouterSet(_router);
    }

    // ─────────────────────────────────────────────────────────────
    // Core: Mint LP Tokens
    // ─────────────────────────────────────────────────────────────

    /**
     * @notice Mint LP tokens to `to` in exchange for deposited tokens.
     *         Tokens must have been transferred to this contract before calling.
     * @param to Recipient of LP tokens
     * @return liquidity Amount of LP tokens minted
     */
    function mint(address to) external override nonReentrant onlyRouter returns (uint256 liquidity) {
        (uint112 reserveA_, uint112 reserveB_,) = getReserves();

        uint256 balanceA = IERC20(tokenA).balanceOf(address(this));
        uint256 balanceB = IERC20(tokenB).balanceOf(address(this));
        uint256 amountA = balanceA - reserveA_;
        uint256 amountB = balanceB - reserveB_;

        uint256 _totalSupply = totalSupply();

        if (_totalSupply == 0) {
            // First deposit: geometric mean minus MINIMUM_LIQUIDITY locked forever
            liquidity = _sqrt(amountA * amountB) - MINIMUM_LIQUIDITY;
            // Lock MINIMUM_LIQUIDITY to address(1) — permanently removes from circulation
            _mint(address(1), MINIMUM_LIQUIDITY);
        } else {
            // Subsequent deposits: proportional to existing reserves
            uint256 liqA = (amountA * _totalSupply) / reserveA_;
            uint256 liqB = (amountB * _totalSupply) / reserveB_;
            liquidity = liqA < liqB ? liqA : liqB;
        }

        require(liquidity > 0, "LiquidityPool: insufficient liquidity minted");
        _mint(to, liquidity);

        _update(balanceA, balanceB, reserveA_, reserveB_);
        kLast = uint256(_reserveA) * uint256(_reserveB);

        emit LiquidityAdded(to, amountA, amountB, liquidity);
    }

    // ─────────────────────────────────────────────────────────────
    // Core: Burn LP Tokens
    // ─────────────────────────────────────────────────────────────

    /**
     * @notice Burn LP tokens and return underlying tokens to `to`.
     *         LP tokens must have been transferred to this contract before calling.
     * @param to Recipient of redeemed tokens
     * @return amountA Amount of token A returned
     * @return amountB Amount of token B returned
     */
    function burn(address to) external override nonReentrant onlyRouter returns (uint256 amountA, uint256 amountB) {
        (uint112 reserveA_, uint112 reserveB_,) = getReserves();

        uint256 balanceA = IERC20(tokenA).balanceOf(address(this));
        uint256 balanceB = IERC20(tokenB).balanceOf(address(this));
        uint256 liquidity = balanceOf(address(this));

        uint256 _totalSupply = totalSupply();
        amountA = (liquidity * balanceA) / _totalSupply;
        amountB = (liquidity * balanceB) / _totalSupply;

        require(amountA > 0 && amountB > 0, "LiquidityPool: insufficient liquidity burned");

        _burn(address(this), liquidity);
        IERC20(tokenA).safeTransfer(to, amountA);
        IERC20(tokenB).safeTransfer(to, amountB);

        balanceA = IERC20(tokenA).balanceOf(address(this));
        balanceB = IERC20(tokenB).balanceOf(address(this));

        _update(balanceA, balanceB, reserveA_, reserveB_);
        kLast = uint256(_reserveA) * uint256(_reserveB);

        emit LiquidityRemoved(to, amountA, amountB, liquidity);
    }

    // ─────────────────────────────────────────────────────────────
    // Core: Swap
    // ─────────────────────────────────────────────────────────────

    /**
     * @notice Execute a swap. Tokens in must have been transferred to this contract.
     *         Router is responsible for computing correct amounts and safety checks.
     * @param amount0Out Amount of tokenA to send out
     * @param amount1Out Amount of tokenB to send out
     * @param to         Recipient address
     */
    function swap(
        uint256 amount0Out,
        uint256 amount1Out,
        address to
    ) external override nonReentrant onlyRouter {
        require(amount0Out > 0 || amount1Out > 0, "LiquidityPool: insufficient output");
        (uint112 reserveA_, uint112 reserveB_,) = getReserves();
        require(amount0Out < reserveA_ && amount1Out < reserveB_, "LiquidityPool: insufficient liquidity");
        require(to != tokenA && to != tokenB, "LiquidityPool: invalid to");

        if (amount0Out > 0) IERC20(tokenA).safeTransfer(to, amount0Out);
        if (amount1Out > 0) IERC20(tokenB).safeTransfer(to, amount1Out);

        uint256 balanceA = IERC20(tokenA).balanceOf(address(this));
        uint256 balanceB = IERC20(tokenB).balanceOf(address(this));

        // Compute how much came in
        uint256 amountAIn = balanceA > reserveA_ - amount0Out ? balanceA - (reserveA_ - amount0Out) : 0;
        uint256 amountBIn = balanceB > reserveB_ - amount1Out ? balanceB - (reserveB_ - amount1Out) : 0;
        require(amountAIn > 0 || amountBIn > 0, "LiquidityPool: insufficient input");

        // Verify constant product invariant (with fee baked in)
        // (balanceA * 1000 - amountAIn * 3) * (balanceB * 1000 - amountBIn * 3) >= reserveA * reserveB * 1000^2
        uint256 balanceAAdjusted = (balanceA * 1000) - (amountAIn * FEE_NUMERATOR);
        uint256 balanceBAdjusted = (balanceB * 1000) - (amountBIn * FEE_NUMERATOR);
        require(
            balanceAAdjusted * balanceBAdjusted >= uint256(reserveA_) * uint256(reserveB_) * 1_000_000,
            "LiquidityPool: invariant K violated"
        );

        // Track fees
        if (amountAIn > 0) totalFeesEarnedA += (amountAIn * FEE_NUMERATOR) / FEE_DENOMINATOR;
        if (amountBIn > 0) totalFeesEarnedB += (amountBIn * FEE_NUMERATOR) / FEE_DENOMINATOR;

        _update(balanceA, balanceB, reserveA_, reserveB_);

        emit Swapped(to, amountAIn, amountBIn, amount0Out, amount1Out);
    }

    // ─────────────────────────────────────────────────────────────
    // View Functions
    // ─────────────────────────────────────────────────────────────

    /**
     * @notice Returns current reserves and the last update timestamp.
     */
    function getReserves()
        public
        view
        override
        returns (uint112 reserveA_, uint112 reserveB_, uint32 blockTimestampLast_)
    {
        reserveA_ = _reserveA;
        reserveB_ = _reserveB;
        blockTimestampLast_ = _blockTimestampLast;
    }

    /**
     * @notice Returns the spot price of tokenA denominated in tokenB (18 decimal fixed point).
     */
    function getSpotPrice() external view override returns (uint256 price) {
        require(_reserveA > 0 && _reserveB > 0, "LiquidityPool: no reserves");
        price = (uint256(_reserveB) * 1e18) / uint256(_reserveA);
    }

    /**
     * @notice Returns each LP holder's share of the pool as basis points (1 bp = 0.01%).
     * @param holder Address to query
     */
    function getShareBasisPoints(address holder) external view returns (uint256 bps) {
        uint256 supply = totalSupply();
        if (supply == 0) return 0;
        bps = (balanceOf(holder) * 10_000) / supply;
    }

    /**
     * @notice Returns the tokens underlying a given LP token amount.
     * @param lpAmount LP token amount to query
     */
    function getUnderlyingTokens(uint256 lpAmount)
        external
        view
        returns (uint256 underlyingA, uint256 underlyingB)
    {
        uint256 supply = totalSupply();
        require(supply > 0, "LiquidityPool: no supply");
        underlyingA = (lpAmount * uint256(_reserveA)) / supply;
        underlyingB = (lpAmount * uint256(_reserveB)) / supply;
    }

    // ─────────────────────────────────────────────────────────────
    // Force-sync (safety valve)
    // ─────────────────────────────────────────────────────────────

    /**
     * @notice Sync reserves to match actual token balances.
     *         Useful if tokens were sent directly without going through swap().
     */
    function sync() external nonReentrant {
        _update(
            IERC20(tokenA).balanceOf(address(this)),
            IERC20(tokenB).balanceOf(address(this)),
            _reserveA,
            _reserveB
        );
    }

    // ─────────────────────────────────────────────────────────────
    // Internal Helpers
    // ─────────────────────────────────────────────────────────────

    /**
     * @dev Update reserves and TWAP price accumulators.
     */
    function _update(
        uint256 balanceA_,
        uint256 balanceB_,
        uint112 reserveA_,
        uint112 reserveB_
    ) private {
        require(balanceA_ <= type(uint112).max && balanceB_ <= type(uint112).max, "LiquidityPool: overflow");

        uint32 blockTimestamp = uint32(block.timestamp % 2 ** 32);
        uint32 timeElapsed = blockTimestamp - _blockTimestampLast;

        if (timeElapsed > 0 && reserveA_ > 0 && reserveB_ > 0) {
            // Overflow is intentional for TWAP accumulators (standard Uniswap pattern)
            unchecked {
                price0CumulativeLast += (uint256(reserveB_) * 1e18 / uint256(reserveA_)) * timeElapsed;
                price1CumulativeLast += (uint256(reserveA_) * 1e18 / uint256(reserveB_)) * timeElapsed;
            }
        }

        _reserveA = uint112(balanceA_);
        _reserveB = uint112(balanceB_);
        _blockTimestampLast = blockTimestamp;

        emit Sync(uint112(balanceA_), uint112(balanceB_));
    }

    /**
     * @dev Babylonian square root (Uniswap V2 method).
     */
    function _sqrt(uint256 y) private pure returns (uint256 z) {
        if (y > 3) {
            z = y;
            uint256 x = y / 2 + 1;
            while (x < z) {
                z = x;
                x = (y / x + x) / 2;
            }
        } else if (y != 0) {
            z = 1;
        }
    }

    /**
     * @dev Safely fetch an ERC-20 symbol, returning "???" if it reverts.
     */
    function _tokenSymbol(address token) private view returns (string memory) {
        try IERC20Metadata(token).symbol() returns (string memory sym) {
            return sym;
        } catch {
            return "???";
        }
    }
}

interface IERC20Metadata {
    function symbol() external view returns (string memory);
}
