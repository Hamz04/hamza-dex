// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ILiquidityPool
 * @notice Interface for a ArcSwap constant-product liquidity pool.
 *         Implemented by LiquidityPool.sol.
 */
interface ILiquidityPool {
    // ─────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────

    /**
     * @notice Emitted when liquidity is added to the pool.
     * @param provider  Address that added liquidity
     * @param amountA   Amount of token A deposited
     * @param amountB   Amount of token B deposited
     * @param liquidity LP tokens minted
     */
    event LiquidityAdded(
        address indexed provider,
        uint256 amountA,
        uint256 amountB,
        uint256 liquidity
    );

    /**
     * @notice Emitted when liquidity is removed from the pool.
     * @param provider  Address that removed liquidity
     * @param amountA   Amount of token A returned
     * @param amountB   Amount of token B returned
     * @param liquidity LP tokens burned
     */
    event LiquidityRemoved(
        address indexed provider,
        uint256 amountA,
        uint256 amountB,
        uint256 liquidity
    );

    /**
     * @notice Emitted on every successful swap.
     * @param sender    Address that initiated the swap (the router)
     * @param amountAIn Amount of token A sent in
     * @param amountBIn Amount of token B sent in
     * @param amountAOut Amount of token A sent out
     * @param amountBOut Amount of token B sent out
     */
    event Swapped(
        address indexed sender,
        uint256 amountAIn,
        uint256 amountBIn,
        uint256 amountAOut,
        uint256 amountBOut
    );

    // ─────────────────────────────────────────────────────────────
    // View Functions
    // ─────────────────────────────────────────────────────────────

    /// @notice Address of token A (always the lower address of the pair)
    function tokenA() external view returns (address);

    /// @notice Address of token B (always the higher address of the pair)
    function tokenB() external view returns (address);

    /// @notice Minimum liquidity permanently locked on first deposit
    function MINIMUM_LIQUIDITY() external pure returns (uint256);

    /// @notice Fee numerator (3 for 0.3%)
    function FEE_NUMERATOR() external pure returns (uint256);

    /// @notice Fee denominator (1000 for 0.3%)
    function FEE_DENOMINATOR() external pure returns (uint256);

    /// @notice Last recorded k = reserveA * reserveB
    function kLast() external view returns (uint256);

    /// @notice Cumulative price of tokenA in terms of tokenB (for TWAP)
    function price0CumulativeLast() external view returns (uint256);

    /// @notice Cumulative price of tokenB in terms of tokenA (for TWAP)
    function price1CumulativeLast() external view returns (uint256);

    /// @notice Total swap fees collected denominated in tokenA
    function totalFeesEarnedA() external view returns (uint256);

    /// @notice Total swap fees collected denominated in tokenB
    function totalFeesEarnedB() external view returns (uint256);

    /**
     * @notice Returns current reserves and block timestamp of last sync.
     * @return reserveA_          Current reserve of token A
     * @return reserveB_          Current reserve of token B
     * @return blockTimestampLast_ Last update timestamp (mod 2^32)
     */
    function getReserves()
        external
        view
        returns (
            uint112 reserveA_,
            uint112 reserveB_,
            uint32  blockTimestampLast_
        );

    /**
     * @notice Spot price of tokenA in tokenB (18-decimal fixed point).
     * @return price  reserveB * 1e18 / reserveA
     */
    function getSpotPrice() external view returns (uint256 price);

    /**
     * @notice Returns an LP holder's share in basis points (1 bp = 0.01%).
     * @param holder Address to query
     * @return bps   Share in basis points (0–10000)
     */
    function getShareBasisPoints(address holder) external view returns (uint256 bps);

    /**
     * @notice Returns the underlying token amounts redeemable for a given LP amount.
     * @param lpAmount       LP token amount
     * @return underlyingA   Token A amount
     * @return underlyingB   Token B amount
     */
    function getUnderlyingTokens(uint256 lpAmount)
        external
        view
        returns (uint256 underlyingA, uint256 underlyingB);

    // ─────────────────────────────────────────────────────────────
    // State-Changing Functions (callable by router only)
    // ─────────────────────────────────────────────────────────────

    /**
     * @notice Mint LP tokens to `to`. Tokens must be transferred to the pool first.
     * @param to Recipient of LP tokens
     * @return liquidity LP tokens minted
     */
    function mint(address to) external returns (uint256 liquidity);

    /**
     * @notice Burn LP tokens from the pool and return underlying tokens to `to`.
     *         LP tokens must be transferred to the pool first.
     * @param to Recipient of underlying tokens
     * @return amountA Token A returned
     * @return amountB Token B returned
     */
    function burn(address to) external returns (uint256 amountA, uint256 amountB);

    /**
     * @notice Execute a swap. Tokens in must have already been transferred.
     * @param amount0Out Amount of tokenA to send out
     * @param amount1Out Amount of tokenB to send out
     * @param to         Recipient
     */
    function swap(uint256 amount0Out, uint256 amount1Out, address to) external;

    /**
     * @notice Force-sync reserves to actual token balances.
     */
    function sync() external;
}
