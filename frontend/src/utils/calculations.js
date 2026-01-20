/**
 * calculations.js
 * Pure math utilities for AMM price impact and amount calculations.
 * All BigInt operations mirror the Solidity contract math exactly.
 */

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────

export const FEE_NUMERATOR = 3n;
export const FEE_DENOMINATOR = 1000n;
export const WAD = 10n ** 18n;

// ─────────────────────────────────────────────────────────────────
// Core AMM Math
// ─────────────────────────────────────────────────────────────────

/**
 * Calculate output amount using constant product formula with 0.3% fee.
 * Mirrors: getAmountOut in HamzaSwap.sol
 *
 * Formula: amountOut = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)
 *
 * @param {bigint} amountIn   - Input token amount in wei
 * @param {bigint} reserveIn  - Pool reserve of input token
 * @param {bigint} reserveOut - Pool reserve of output token
 * @returns {bigint} Expected output amount
 */
export function getAmountOut(amountIn, reserveIn, reserveOut) {
  if (amountIn <= 0n) throw new Error("Insufficient input amount");
  if (reserveIn <= 0n || reserveOut <= 0n) throw new Error("Insufficient liquidity");

  const amountInWithFee = amountIn * 997n;
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn * 1000n + amountInWithFee;
  return numerator / denominator;
}

/**
 * Calculate required input for an exact output.
 * Mirrors: getAmountIn in HamzaSwap.sol
 *
 * Formula: amountIn = (reserveIn * amountOut * 1000) / ((reserveOut - amountOut) * 997) + 1
 *
 * @param {bigint} amountOut  - Desired output amount
 * @param {bigint} reserveIn  - Pool reserve of input token
 * @param {bigint} reserveOut - Pool reserve of output token
 * @returns {bigint} Required input amount
 */
export function getAmountIn(amountOut, reserveIn, reserveOut) {
  if (amountOut <= 0n) throw new Error("Insufficient output amount");
  if (reserveIn <= 0n || reserveOut <= 0n) throw new Error("Insufficient liquidity");
  if (amountOut >= reserveOut) throw new Error("Insufficient liquidity for desired output");

  const numerator = reserveIn * amountOut * 1000n;
  const denominator = (reserveOut - amountOut) * 997n;
  return numerator / denominator + 1n;
}

/**
 * Calculate price impact percentage for a given swap.
 *
 * Price impact = (spotPrice - executionPrice) / spotPrice * 100
 * Where:
 *   spotPrice      = reserveOut / reserveIn (no fee)
 *   executionPrice = amountOut / amountIn (after fee)
 *
 * @param {bigint} amountIn   - Input amount
 * @param {bigint} reserveIn  - Input reserve
 * @param {bigint} reserveOut - Output reserve
 * @returns {number} Price impact as a percentage (e.g. 0.15 = 0.15%)
 */
export function calculatePriceImpact(amountIn, reserveIn, reserveOut) {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0;

  try {
    const amountOut = getAmountOut(amountIn, reserveIn, reserveOut);

    // Spot price (no fee): reserveOut / reserveIn scaled by WAD
    const spotPrice = (reserveOut * WAD) / reserveIn;

    // Execution price: amountOut / amountIn scaled by WAD
    const executionPrice = (amountOut * WAD) / amountIn;

    if (spotPrice === 0n) return 0;

    // Impact = (spotPrice - executionPrice) / spotPrice
    const impact = ((spotPrice - executionPrice) * 10000n) / spotPrice;

    // Convert from basis points to percentage
    return Number(impact) / 100;
  } catch {
    return 0;
  }
}

/**
 * Calculate minimum output amount after applying slippage tolerance.
 *
 * @param {bigint} amount        - Expected output amount
 * @param {number} slippagePct   - Slippage tolerance in percent (e.g. 0.5 = 0.5%)
 * @returns {bigint} Minimum acceptable output
 */
export function calculateMinimumOut(amount, slippagePct) {
  if (amount <= 0n) return 0n;
  const slippageBps = BigInt(Math.round(slippagePct * 100)); // e.g. 0.5% → 50 bps
  return (amount * (10000n - slippageBps)) / 10000n;
}

/**
 * Calculate maximum input amount after applying slippage tolerance.
 *
 * @param {bigint} amount        - Expected input amount
 * @param {number} slippagePct   - Slippage tolerance in percent
 * @returns {bigint} Maximum acceptable input
 */
export function calculateMaximumIn(amount, slippagePct) {
  if (amount <= 0n) return 0n;
  const slippageBps = BigInt(Math.round(slippagePct * 100));
  return (amount * (10000n + slippageBps)) / 10000n;
}

// ─────────────────────────────────────────────────────────────────
// LP Math
// ─────────────────────────────────────────────────────────────────

/**
 * Calculate LP tokens to be minted for a deposit.
 *
 * @param {bigint} amountA     - Amount of tokenA depositing
 * @param {bigint} amountB     - Amount of tokenB depositing
 * @param {bigint} reserveA    - Current reserveA
 * @param {bigint} reserveB    - Current reserveB
 * @param {bigint} totalSupply - Total LP supply
 * @returns {bigint} Expected LP tokens
 */
export function calculateLPTokens(amountA, amountB, reserveA, reserveB, totalSupply) {
  if (totalSupply === 0n) {
    // First deposit: geometric mean minus MINIMUM_LIQUIDITY
    return bigintSqrt(amountA * amountB) - 1000n;
  }
  // Proportional: min(amountA/reserveA, amountB/reserveB) * totalSupply
  const lpA = (amountA * totalSupply) / reserveA;
  const lpB = (amountB * totalSupply) / reserveB;
  return lpA < lpB ? lpA : lpB;
}

/**
 * Calculate optimal tokenB amount given tokenA for maintaining pool ratio.
 *
 * @param {bigint} amountA  - Amount of tokenA
 * @param {bigint} reserveA - Current reserveA
 * @param {bigint} reserveB - Current reserveB
 * @returns {bigint} Optimal tokenB amount
 */
export function calculateOptimalB(amountA, reserveA, reserveB) {
  if (reserveA === 0n || reserveB === 0n) return amountA; // first deposit ratio is free
  return (amountA * reserveB) / reserveA;
}

/**
 * Babylonian integer square root.
 * @param {bigint} n
 * @returns {bigint}
 */
export function bigintSqrt(n) {
  if (n < 0n) throw new Error("Square root of negative number");
  if (n === 0n) return 0n;
  let z = n;
  let x = n / 2n + 1n;
  while (x < z) {
    z = x;
    x = (n / x + x) / 2n;
  }
  return z;
}

// ─────────────────────────────────────────────────────────────────
// Formatting
// ─────────────────────────────────────────────────────────────────

/**
 * Format a token amount (in wei) to a human-readable string.
 *
 * @param {bigint|string} amount   - Token amount in wei
 * @param {number}        decimals - Token decimals (default 18)
 * @param {number}        display  - Decimal places to display (default 6)
 * @returns {string} Formatted amount (e.g. "1,234.567890")
 */
export function formatTokenAmount(amount, decimals = 18, display = 6) {
  if (amount === null || amount === undefined) return "0";
  try {
    const bigAmount = typeof amount === "bigint" ? amount : BigInt(amount.toString());
    const divisor = 10n ** BigInt(decimals);
    const whole = bigAmount / divisor;
    const fractional = bigAmount % divisor;

    const wholeStr = whole.toLocaleString("en-US");

    if (display === 0) return wholeStr;

    const fracStr = fractional.toString().padStart(decimals, "0").slice(0, display);
    const trimmed = fracStr.replace(/0+$/, "");

    if (!trimmed) return wholeStr;
    return `${wholeStr}.${trimmed}`;
  } catch {
    return "0";
  }
}

/**
 * Format a USD price value.
 * @param {number} value
 * @returns {string}
 */
export function formatUSD(value) {
  if (value === null || value === undefined || isNaN(value)) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(value);
}

/**
 * Format a percentage.
 * @param {number} value
 * @param {number} decimals
 * @returns {string}
 */
export function formatPercent(value, decimals = 2) {
  if (value === null || value === undefined || isNaN(value)) return "0%";
  return `${value.toFixed(decimals)}%`;
}

/**
 * Shorten an Ethereum address for display.
 * @param {string} address
 * @returns {string} e.g. "0x1234...abcd"
 */
export function shortenAddress(address) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Parse a human-readable token amount string to wei (bigint).
 * @param {string} value   - e.g. "1234.56"
 * @param {number} decimals
 * @returns {bigint}
 */
export function parseTokenAmount(value, decimals = 18) {
  if (!value || value === "" || value === ".") return 0n;
  try {
    const [whole, frac = ""] = value.split(".");
    const fracPadded = frac.slice(0, decimals).padEnd(decimals, "0");
    const combined = (whole || "0") + fracPadded;
    return BigInt(combined);
  } catch {
    return 0n;
  }
}

/**
 * Calculate estimated APY from fee data.
 * @param {bigint} feesEarnedA - Fees in tokenA
 * @param {bigint} feesEarnedB - Fees in tokenB
 * @param {bigint} reserveA    - Current reserveA
 * @param {bigint} reserveB    - Current reserveB
 * @param {number} daysActive  - Days the pool has been active
 * @returns {number} Estimated APY as percentage
 */
export function estimateAPY(feesEarnedA, feesEarnedB, reserveA, reserveB, daysActive = 1) {
  if (reserveA === 0n || reserveB === 0n || daysActive <= 0) return 0;
  try {
    // Total pool value ≈ 2 * reserveA (assuming 1:1 price for simplicity)
    const totalPoolValue = Number(reserveA) / 1e18 + Number(reserveB) / 1e18;
    const totalFees = Number(feesEarnedA) / 1e18 + Number(feesEarnedB) / 1e18;

    if (totalPoolValue === 0) return 0;

    const dailyFeeRate = totalFees / totalPoolValue / daysActive;
    const apy = dailyFeeRate * 365 * 100;
    return Math.min(apy, 9999); // cap at 9999%
  } catch {
    return 0;
  }
}

/**
 * Get price impact color class based on severity.
 * @param {number} impact - Price impact percentage
 * @returns {string} Tailwind color class
 */
export function getPriceImpactColor(impact) {
  if (impact < 0.1)  return "text-emerald-400";
  if (impact < 0.5)  return "text-yellow-400";
  if (impact < 1.0)  return "text-orange-400";
  if (impact < 3.0)  return "text-red-400";
  return "text-red-500 font-bold";
}

/**
 * Get price impact severity label.
 * @param {number} impact
 * @returns {string}
 */
export function getPriceImpactLabel(impact) {
  if (impact < 0.1) return "Very Low";
  if (impact < 0.5) return "Low";
  if (impact < 1.0) return "Medium";
  if (impact < 3.0) return "High";
  return "Very High";
}
