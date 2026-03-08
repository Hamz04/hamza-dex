// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IArcSwap
 * @notice Interface for the ArcSwap AMM router.
 *         Implemented by ArcSwap.sol.
 */
interface IArcSwap {
    // ─────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────

    /**
     * @notice Emitted when a new trading pair is created.
     * @param token0   First token (lower address)
     * @param token1   Second token (higher address)
     * @param pair     Address of the new LiquidityPool contract
     * @param pairIndex Total number of pairs after creation
     */
    event PairCreated(
        address indexed token0,
        address indexed token1,
        address pair,
        uint256 pairIndex
    );

    /**
     * @notice Emitted on every successful swap.
     * @param sender    Transaction sender
     * @param tokenIn   Input token address
     * @param tokenOut  Output token address
     * @param amountIn  Amount of input tokens spent
     * @param amountOut Amount of output tokens received
     * @param to        Recipient of output tokens
     */
    event Swap(
        address indexed sender,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        address to
    );

    /**
     * @notice Emitted when liquidity is added.
     * @param provider  Liquidity provider
     * @param tokenA    First token address
     * @param tokenB    Second token address
     * @param amountA   Amount of tokenA deposited
     * @param amountB   Amount of tokenB deposited
     * @param liquidity LP tokens minted
     */
    event LiquidityAdded(
        address indexed provider,
        address indexed tokenA,
        address indexed tokenB,
        uint256 amountA,
        uint256 amountB,
        uint256 liquidity
    );

    /**
     * @notice Emitted when liquidity is removed.
     * @param provider  Liquidity provider
     * @param tokenA    First token address
     * @param tokenB    Second token address
     * @param amountA   Amount of tokenA returned
     * @param amountB   Amount of tokenB returned
     * @param liquidity LP tokens burned
     */
    event LiquidityRemoved(
        address indexed provider,
        address indexed tokenA,
        address indexed tokenB,
        uint256 amountA,
        uint256 amountB,
        uint256 liquidity
    );

    // ─────────────────────────────────────────────────────────────
    // View: Pair Registry
    // ─────────────────────────────────────────────────────────────

    /**
     * @notice Returns the pool address for a given token pair (order-independent).
     * @param tokenA First token
     * @param tokenB Second token
     * @return pair  Pool address, or address(0) if not created
     */
    function getPair(address tokenA, address tokenB) external view returns (address pair);

    /**
     * @notice Returns pool address at index `i` in creation order.
     */
    function allPairs(uint256 i) external view returns (address pair);

    /**
     * @notice Returns total number of created pairs.
     */
    function allPairsLength() external view returns (uint256);

    // ─────────────────────────────────────────────────────────────
    // Factory
    // ─────────────────────────────────────────────────────────────

    /**
     * @notice Deploy a new LiquidityPool contract for (tokenA, tokenB).
     * @param tokenA First token address
     * @param tokenB Second token address
     * @return pair  Address of the created pool
     */
    function createPair(address tokenA, address tokenB) external returns (address pair);

    // ─────────────────────────────────────────────────────────────
    // Liquidity Management
    // ─────────────────────────────────────────────────────────────

    /**
     * @notice Add liquidity to the (tokenA, tokenB) pool. Creates pool if needed.
     * @param tokenA        First token
     * @param tokenB        Second token
     * @param amountADesired Max tokenA to deposit
     * @param amountBDesired Max tokenB to deposit
     * @param amountAMin    Min tokenA to deposit (slippage guard)
     * @param amountBMin    Min tokenB to deposit (slippage guard)
     * @param to            LP token recipient
     * @param deadline      Expiry timestamp
     * @return amountA      Actual tokenA deposited
     * @return amountB      Actual tokenB deposited
     * @return liquidity    LP tokens minted
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
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity);

    /**
     * @notice Remove liquidity by burning LP tokens.
     * @param tokenA     First token
     * @param tokenB     Second token
     * @param liquidity  LP tokens to burn
     * @param amountAMin Min tokenA to receive
     * @param amountBMin Min tokenB to receive
     * @param to         Recipient
     * @param deadline   Expiry timestamp
     * @return amountA   Token A returned
     * @return amountB   Token B returned
     */
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB);

    // ─────────────────────────────────────────────────────────────
    // Swap
    // ─────────────────────────────────────────────────────────────

    /**
     * @notice Swap exact input for as many output tokens as possible.
     * @param amountIn      Input token amount
     * @param amountOutMin  Min output (slippage protection)
     * @param path          Swap route: [tokenIn, ..., tokenOut]
     * @param to            Output recipient
     * @param deadline      Expiry timestamp
     * @return amounts      Amounts at each hop
     */
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    /**
     * @notice Swap as few input tokens as possible to receive exact output.
     * @param amountOut     Exact output amount desired
     * @param amountInMax   Max input to spend (slippage protection)
     * @param path          Swap route
     * @param to            Output recipient
     * @param deadline      Expiry timestamp
     * @return amounts      Amounts at each hop
     */
    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);

    // ─────────────────────────────────────────────────────────────
    // Price & Amount Calculations (pure / view)
    // ─────────────────────────────────────────────────────────────

    /**
     * @notice Constant-product output calculation with 0.3% fee.
     * @param amountIn   Input amount
     * @param reserveIn  Pool reserve of input token
     * @param reserveOut Pool reserve of output token
     * @return amountOut Expected output
     */
    function getAmountOut(
        uint256 amountIn,
        uint256 reserveIn,
        uint256 reserveOut
    ) external pure returns (uint256 amountOut);

    /**
     * @notice Constant-product input calculation for exact output.
     * @param amountOut  Desired output amount
     * @param reserveIn  Pool reserve of input token
     * @param reserveOut Pool reserve of output token
     * @return amountIn  Required input
     */
    function getAmountIn(
        uint256 amountOut,
        uint256 reserveIn,
        uint256 reserveOut
    ) external pure returns (uint256 amountIn);

    /**
     * @notice Compute output amounts for a multi-hop path.
     * @param amountIn Starting input amount
     * @param path     Token addresses for each hop
     * @return amounts Output amounts array (length = path.length)
     */
    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts);

    /**
     * @notice Compute required input amounts for a multi-hop path (reverse).
     * @param amountOut Final desired output
     * @param path      Token addresses for each hop
     * @return amounts  Required input amounts array
     */
    function getAmountsIn(uint256 amountOut, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts);

    /**
     * @notice Get spot price of tokenA denominated in tokenB.
     * @param tokenA Base token
     * @param tokenB Quote token
     * @return price  Spot price with 18 decimal precision
     */
    function getPrice(address tokenA, address tokenB) external view returns (uint256 price);
}
