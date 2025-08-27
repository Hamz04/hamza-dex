// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./LiquidityPool.sol";
import "./interfaces/IHamzaSwap.sol";
import "./interfaces/ILiquidityPool.sol";

/**
 * @title HamzaSwap
 * @author Hamza Ahmad
 * @notice Core AMM router for HamzaDEX. Implements Uniswap V2-style constant product AMM.
 *         Supports single-hop and multi-hop swaps, liquidity management, and price queries.
 *
 * AMM Formula:
 *   x * y = k  (constant product invariant)
 *   amountOut = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)
 *   Where 997/1000 represents the 0.3% fee retained in the pool.
 *
 * @dev All token transfers use SafeERC20. Reentrancy protected. Deadline enforced on all state-changing calls.
 */
contract HamzaSwap is IHamzaSwap, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────────

    /// @notice tokenA => tokenB => pool address (canonical: tokenA < tokenB)
    mapping(address => mapping(address => address)) public getPair;

    /// @notice Array of all created pool addresses
    address[] public allPairs;

    /// @notice Protocol fee recipient (future use — currently 0)
    address public feeTo;

    // ─────────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────────

    error Expired(uint256 deadline, uint256 blockTimestamp);
    error InsufficientOutputAmount(uint256 amountOut, uint256 amountOutMin);
    error InsufficientInputAmount();
    error InsufficientLiquidity(uint256 reserveIn, uint256 reserveOut);
    error InvalidPath();
    error PairExists(address pair);
    error PairNotFound(address tokenA, address tokenB);
    error IdenticalTokens();
    error ZeroAddress();
    error ExcessiveSlippage(uint256 amountA, uint256 amountB, uint256 amountADesired, uint256 amountBDesired);

    // ─────────────────────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────────────────────

    modifier ensure(uint256 deadline) {
        if (deadline < block.timestamp) revert Expired(deadline, block.timestamp);
        _;
    }

    // ─────────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────────

    constructor(address initialOwner) Ownable(initialOwner) {}

    // ─────────────────────────────────────────────────────────────
    // Factory: Create Pair
    // ─────────────────────────────────────────────────────────────

    /**
     * @notice Deploy a new LiquidityPool for a token pair.
     * @param tokenA Address of the first token
     * @param tokenB Address of the second token
     * @return pair  Address of the newly created pool
     */
    function createPair(address tokenA, address tokenB)
        external
        override
        returns (address pair)
    {
        if (tokenA == tokenB) revert IdenticalTokens();
        if (tokenA == address(0) || tokenB == address(0)) revert ZeroAddress();

        // Canonical ordering
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);

        if (getPair[token0][token1] != address(0)) revert PairExists(getPair[token0][token1]);

        // Deploy pool
        LiquidityPool pool = new LiquidityPool(token0, token1, address(this));
        pool.setRouter(address(this));

        pair = address(pool);
        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair; // also index reverse direction
        allPairs.push(pair);

        emit PairCreated(token0, token1, pair, allPairs.length);
    }

    // ─────────────────────────────────────────────────────────────
    // Liquidity: Add
    // ─────────────────────────────────────────────────────────────

    /**
     * @notice Add liquidity to a pool. Creates the pool if it doesn't exist.
     * @param tokenA       First token address
     * @param tokenB       Second token address
     * @param amountADesired  Max amount of tokenA to deposit
     * @param amountBDesired  Max amount of tokenB to deposit
     * @param amountAMin   Minimum amount of tokenA (slippage protection)
     * @param amountBMin   Minimum amount of tokenB (slippage protection)
     * @param to           Recipient of LP tokens
     * @param deadline     Unix timestamp after which the transaction reverts
     * @return amountA     Actual amount of tokenA deposited
     * @return amountB     Actual amount of tokenB deposited
     * @return liquidity   LP tokens minted
     */
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    )
        external
        override
        nonReentrant
        ensure(deadline)
        returns (uint256 amountA, uint256 amountB, uint256 liquidity)
    {
        // Create pair if it doesn't exist yet
        if (_getPair(tokenA, tokenB) == address(0)) {
            // We call internal _createPair to avoid re-checking
            _createPairInternal(tokenA, tokenB);
        }

        (amountA, amountB) = _calculateLiquidityAmounts(
            tokenA, tokenB,
            amountADesired, amountBDesired,
            amountAMin, amountBMin
        );

        address pair = _getPair(tokenA, tokenB);
        IERC20(tokenA).safeTransferFrom(msg.sender, pair, amountA);
        IERC20(tokenB).safeTransferFrom(msg.sender, pair, amountB);
        liquidity = ILiquidityPool(pair).mint(to);

        emit LiquidityAdded(msg.sender, tokenA, tokenB, amountA, amountB, liquidity);
    }

    // ─────────────────────────────────────────────────────────────
    // Liquidity: Remove
    // ─────────────────────────────────────────────────────────────

    /**
     * @notice Remove liquidity from a pool by burning LP tokens.
     * @param tokenA    First token address
     * @param tokenB    Second token address
     * @param liquidity LP token amount to burn
     * @param amountAMin Minimum token A to receive (slippage protection)
     * @param amountBMin Minimum token B to receive (slippage protection)
     * @param to        Recipient of redeemed tokens
     * @param deadline  Unix timestamp after which the transaction reverts
     * @return amountA  Token A returned
     * @return amountB  Token B returned
     */
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    )
        external
        override
        nonReentrant
        ensure(deadline)
        returns (uint256 amountA, uint256 amountB)
    {
        address pair = _getPairOrRevert(tokenA, tokenB);

        // Transfer LP tokens from user to pool (pool burns them internally)
        IERC20(pair).safeTransferFrom(msg.sender, pair, liquidity);
        (amountA, amountB) = ILiquidityPool(pair).burn(to);

        // Respect canonical ordering — swap if needed
        (address token0,) = _sortTokens(tokenA, tokenB);
        if (tokenA != token0) {
            (amountA, amountB) = (amountB, amountA);
        }

        if (amountA < amountAMin) revert InsufficientOutputAmount(amountA, amountAMin);
        if (amountB < amountBMin) revert InsufficientOutputAmount(amountB, amountBMin);

        emit LiquidityRemoved(msg.sender, tokenA, tokenB, amountA, amountB, liquidity);
    }

    // ─────────────────────────────────────────────────────────────
    // Swap: Exact Tokens For Tokens
    // ─────────────────────────────────────────────────────────────

    /**
     * @notice Swap an exact amount of input tokens for as many output tokens as possible.
     *         Supports multi-hop routes via `path`.
     * @param amountIn     Exact amount of input tokens to spend
     * @param amountOutMin Minimum output tokens to receive (slippage protection)
     * @param path         Array of token addresses forming the swap route
     * @param to           Recipient of output tokens
     * @param deadline     Unix timestamp after which the transaction reverts
     * @return amounts     Array of amounts at each hop
     */
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    )
        external
        override
        nonReentrant
        ensure(deadline)
        returns (uint256[] memory amounts)
    {
        if (path.length < 2) revert InvalidPath();

        amounts = getAmountsOut(amountIn, path);
        if (amounts[amounts.length - 1] < amountOutMin) {
            revert InsufficientOutputAmount(amounts[amounts.length - 1], amountOutMin);
        }

        // Transfer first token from sender to first pool
        IERC20(path[0]).safeTransferFrom(
            msg.sender,
            _getPairOrRevert(path[0], path[1]),
            amounts[0]
        );

        _executeSwaps(amounts, path, to);

        emit Swap(msg.sender, path[0], path[path.length - 1], amountIn, amounts[amounts.length - 1], to);
    }

    /**
     * @notice Swap tokens to receive an exact amount of output tokens.
     * @param amountOut    Exact amount of output tokens to receive
     * @param amountInMax  Maximum input tokens to spend (slippage protection)
     * @param path         Swap route
     * @param to           Recipient of output tokens
     * @param deadline     Expiry timestamp
     * @return amounts     Array of amounts at each hop
     */
    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    )
        external
        override
        nonReentrant
        ensure(deadline)
        returns (uint256[] memory amounts)
    {
        if (path.length < 2) revert InvalidPath();

        amounts = getAmountsIn(amountOut, path);
        if (amounts[0] > amountInMax) {
            revert InsufficientOutputAmount(amountInMax, amounts[0]);
        }

        IERC20(path[0]).safeTransferFrom(
            msg.sender,
            _getPairOrRevert(path[0], path[1]),
            amounts[0]
        );

        _executeSwaps(amounts, path, to);

        emit Swap(msg.sender, path[0], path[path.length - 1], amounts[0], amountOut, to);
    }

    // ─────────────────────────────────────────────────────────────
    // View: Price & Amount Calculations
    // ─────────────────────────────────────────────────────────────

    /**
     * @notice Calculate output amount for a given input using constant product formula.
     * @param amountIn   Input token amount
     * @param reserveIn  Reserve of input token
     * @param reserveOut Reserve of output token
     * @return amountOut Expected output amount (after 0.3% fee)
     */
    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure override returns (uint256 amountOut) {
        if (amountIn == 0) revert InsufficientInputAmount();
        if (reserveIn == 0 || reserveOut == 0) revert InsufficientLiquidity(reserveIn, reserveOut);

        // amountOut = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)
        uint256 amountInWithFee = amountIn * 997;
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * 1000) + amountInWithFee;
        amountOut = numerator / denominator;
    }

    /**
     * @notice Calculate required input amount to receive an exact output.
     * @param amountOut  Desired output amount
     * @param reserveIn  Reserve of input token
     * @param reserveOut Reserve of output token
     * @return amountIn  Required input amount (before fee)
     */
    function getAmountIn(
        uint256 amountOut,
        uint256 reserveIn,
        uint256 reserveOut
    ) public pure override returns (uint256 amountIn) {
        if (amountOut == 0) revert InsufficientOutputAmount(0, 1);
        if (reserveIn == 0 || reserveOut == 0) revert InsufficientLiquidity(reserveIn, reserveOut);

        // amountIn = (reserveIn * amountOut * 1000) / ((reserveOut - amountOut) * 997) + 1
        uint256 numerator = reserveIn * amountOut * 1000;
        uint256 denominator = (reserveOut - amountOut) * 997;
        amountIn = (numerator / denominator) + 1;
    }

    /**
     * @notice Compute output amounts for each hop along a path.
     * @param amountIn Input amount for the first token in path
     * @param path     Ordered array of token addresses
     * @return amounts Output amounts for each step (amounts[0] = amountIn)
     */
    function getAmountsOut(uint256 amountIn, address[] memory path)
        public
        view
        override
        returns (uint256[] memory amounts)
    {
        if (path.length < 2) revert InvalidPath();
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;

        for (uint256 i = 0; i < path.length - 1; i++) {
            (uint256 reserveIn, uint256 reserveOut) = _getReserves(path[i], path[i + 1]);
            amounts[i + 1] = getAmountOut(amounts[i], reserveIn, reserveOut);
        }
    }

    /**
     * @notice Compute input amounts required for each hop along a path (working backwards).
     * @param amountOut Desired final output amount
     * @param path      Ordered array of token addresses
     * @return amounts  Required input amounts for each step
     */
    function getAmountsIn(uint256 amountOut, address[] memory path)
        public
        view
        override
        returns (uint256[] memory amounts)
    {
        if (path.length < 2) revert InvalidPath();
        amounts = new uint256[](path.length);
        amounts[amounts.length - 1] = amountOut;

        for (uint256 i = path.length - 1; i > 0; i--) {
            (uint256 reserveIn, uint256 reserveOut) = _getReserves(path[i - 1], path[i]);
            amounts[i - 1] = getAmountIn(amounts[i], reserveIn, reserveOut);
        }
    }

    /**
     * @notice Get the spot price of tokenA in terms of tokenB (18-decimal fixed point).
     * @param tokenA Base token
     * @param tokenB Quote token
     * @return price  Spot price: how many tokenB wei per 1e18 tokenA wei
     */
    function getPrice(address tokenA, address tokenB)
        external
        view
        override
        returns (uint256 price)
    {
        (uint256 reserveA, uint256 reserveB) = _getReserves(tokenA, tokenB);
        require(reserveA > 0, "HamzaSwap: no liquidity");
        price = (reserveB * 1e18) / reserveA;
    }

    /**
     * @notice Returns the number of all created pairs.
     */
    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }

    // ─────────────────────────────────────────────────────────────
    // Admin
    // ─────────────────────────────────────────────────────────────

    /**
     * @notice Set the protocol fee recipient address.
     */
    function setFeeTo(address _feeTo) external onlyOwner {
        feeTo = _feeTo;
    }

    // ─────────────────────────────────────────────────────────────
    // Internal Helpers
    // ─────────────────────────────────────────────────────────────

    /**
     * @dev Execute a series of swaps along a path.
     *      At each hop, the output goes either to the next pool or the final recipient.
     */
    function _executeSwaps(
        uint256[] memory amounts,
        address[] memory path,
        address _to
    ) internal {
        for (uint256 i = 0; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0,) = _sortTokens(input, output);

            uint256 amountOut = amounts[i + 1];
            (uint256 amount0Out, uint256 amount1Out) = input == token0
                ? (uint256(0), amountOut)
                : (amountOut, uint256(0));

            // Intermediate hops go to the next pool; final hop goes to recipient
            address to = i < path.length - 2
                ? _getPairOrRevert(output, path[i + 2])
                : _to;

            ILiquidityPool(_getPairOrRevert(input, output)).swap(amount0Out, amount1Out, to);
        }
    }

    /**
     * @dev Calculate optimal deposit amounts respecting existing pool ratio.
     */
    function _calculateLiquidityAmounts(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin
    ) internal view returns (uint256 amountA, uint256 amountB) {
        address pair = _getPair(tokenA, tokenB);

        if (pair == address(0)) {
            // New pool — accept desired amounts as-is
            return (amountADesired, amountBDesired);
        }

        (uint256 reserveA, uint256 reserveB) = _getReserves(tokenA, tokenB);

        if (reserveA == 0 && reserveB == 0) {
            return (amountADesired, amountBDesired);
        }

        // Compute optimal B for desired A
        uint256 amountBOptimal = _quote(amountADesired, reserveA, reserveB);
        if (amountBOptimal <= amountBDesired) {
            if (amountBOptimal < amountBMin) revert ExcessiveSlippage(amountADesired, amountBOptimal, amountADesired, amountBMin);
            return (amountADesired, amountBOptimal);
        }

        // Otherwise compute optimal A for desired B
        uint256 amountAOptimal = _quote(amountBDesired, reserveB, reserveA);
        assert(amountAOptimal <= amountADesired);
        if (amountAOptimal < amountAMin) revert ExcessiveSlippage(amountAOptimal, amountBDesired, amountAMin, amountBDesired);
        return (amountAOptimal, amountBDesired);
    }

    /**
     * @dev Proportional quote: given amountA and reserves, what is amountB?
     */
    function _quote(uint256 amountA, uint256 reserveA, uint256 reserveB)
        internal
        pure
        returns (uint256 amountB)
    {
        require(amountA > 0, "HamzaSwap: insufficient amount");
        require(reserveA > 0 && reserveB > 0, "HamzaSwap: insufficient liquidity");
        amountB = (amountA * reserveB) / reserveA;
    }

    /**
     * @dev Get reserves for a token pair (sorted canonically).
     */
    function _getReserves(address tokenA, address tokenB)
        internal
        view
        returns (uint256 reserveA, uint256 reserveB)
    {
        address pair = _getPairOrRevert(tokenA, tokenB);
        (address token0,) = _sortTokens(tokenA, tokenB);
        (uint112 reserve0, uint112 reserve1,) = ILiquidityPool(pair).getReserves();
        (reserveA, reserveB) = tokenA == token0
            ? (uint256(reserve0), uint256(reserve1))
            : (uint256(reserve1), uint256(reserve0));
    }

    /**
     * @dev Sort two token addresses canonically (lower address first).
     */
    function _sortTokens(address tokenA, address tokenB)
        internal
        pure
        returns (address token0, address token1)
    {
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
    }

    /**
     * @dev Look up pair address without reverting.
     */
    function _getPair(address tokenA, address tokenB) internal view returns (address pair) {
        (address t0, address t1) = _sortTokens(tokenA, tokenB);
        pair = getPair[t0][t1];
    }

    /**
     * @dev Look up pair address and revert if not found.
     */
    function _getPairOrRevert(address tokenA, address tokenB) internal view returns (address pair) {
        pair = _getPair(tokenA, tokenB);
        if (pair == address(0)) revert PairNotFound(tokenA, tokenB);
    }

    /**
     * @dev Internal pair creation without access check (called from addLiquidity).
     */
    function _createPairInternal(address tokenA, address tokenB) internal returns (address pair) {
        (address token0, address token1) = _sortTokens(tokenA, tokenB);
        LiquidityPool pool = new LiquidityPool(token0, token1, address(this));
        pool.setRouter(address(this));
        pair = address(pool);
        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair;
        allPairs.push(pair);
        emit PairCreated(token0, token1, pair, allPairs.length);
    }
}
