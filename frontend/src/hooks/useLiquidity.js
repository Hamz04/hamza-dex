/**
 * useLiquidity.js
 * React hook for liquidity pool interactions: add/remove liquidity and position tracking.
 */

import { useState, useCallback } from "react";
import { ethers } from "ethers";
import {
  getRouterContract,
  getTokenContract,
  getPoolContract,
  getAddresses,
  getDeadline,
  ensureApproval,
  LIQUIDITY_POOL_ABI,
} from "../utils/contracts.js";
import {
  calculateMinimumOut,
  calculateOptimalB,
  estimateAPY,
} from "../utils/calculations.js";

export const LIQ_STATUS = {
  IDLE:       "idle",
  APPROVING:  "approving",
  SUBMITTING: "submitting",
  CONFIRMED:  "confirmed",
  FAILED:     "failed",
};

export function useLiquidity(wallet) {
  const [status, setStatus]   = useState(LIQ_STATUS.IDLE);
  const [txHash, setTxHash]   = useState(null);
  const [error, setError]     = useState(null);
  const [position, setPosition] = useState(null);
  const [loadingPosition, setLoadingPosition] = useState(false);

  const reset = useCallback(() => {
    setStatus(LIQ_STATUS.IDLE);
    setTxHash(null);
    setError(null);
  }, []);

  // ── Add Liquidity ─────────────────────────────────────────────
  const addLiquidity = useCallback(async ({
    tokenAAddress,
    tokenBAddress,
    amountA,
    amountB,
    slippagePct = 0.5,
  }) => {
    if (!wallet.signer || !wallet.chainId) {
      setError("Wallet not connected.");
      return null;
    }

    setError(null);
    setTxHash(null);

    try {
      const addresses  = getAddresses(wallet.chainId);
      const routerAddr = addresses?.HamzaSwap;
      if (!routerAddr) throw new Error("Router not deployed on this network");

      // Step 1: Approve both tokens
      setStatus(LIQ_STATUS.APPROVING);
      const tokenA = getTokenContract(tokenAAddress, wallet.signer);
      const tokenB = getTokenContract(tokenBAddress, wallet.signer);

      await ensureApproval(tokenA, wallet.address, routerAddr, amountA);
      await ensureApproval(tokenB, wallet.address, routerAddr, amountB);

      // Step 2: Add liquidity
      setStatus(LIQ_STATUS.SUBMITTING);
      const router = getRouterContract(wallet.signer, wallet.chainId);

      const amountAMin = calculateMinimumOut(amountA, slippagePct);
      const amountBMin = calculateMinimumOut(amountB, slippagePct);
      const deadline   = getDeadline(20);

      const tx = await router.addLiquidity(
        tokenAAddress,
        tokenBAddress,
        amountA,
        amountB,
        amountAMin,
        amountBMin,
        wallet.address,
        deadline
      );

      setTxHash(tx.hash);
      const receipt = await tx.wait();
      setStatus(LIQ_STATUS.CONFIRMED);

      return { receipt, txHash: tx.hash };
    } catch (err) {
      setStatus(LIQ_STATUS.FAILED);
      const msg = err?.reason || err?.message || "Add liquidity failed";
      setError(msg.includes("user rejected") ? "Transaction rejected by user." : msg);
      return null;
    }
  }, [wallet]);

  // ── Remove Liquidity ──────────────────────────────────────────
  const removeLiquidity = useCallback(async ({
    tokenAAddress,
    tokenBAddress,
    liquidity,
    amountAMin = 0n,
    amountBMin = 0n,
    slippagePct = 0.5,
  }) => {
    if (!wallet.signer || !wallet.chainId) {
      setError("Wallet not connected.");
      return null;
    }

    setError(null);
    setTxHash(null);

    try {
      const addresses  = getAddresses(wallet.chainId);
      const routerAddr = addresses?.HamzaSwap;
      if (!routerAddr) throw new Error("Router not deployed on this network");

      // Step 1: Approve LP token
      setStatus(LIQ_STATUS.APPROVING);
      const router     = getRouterContract(wallet.provider, wallet.chainId);
      const pairAddr   = await router.getPair(tokenAAddress, tokenBAddress);
      if (!pairAddr || pairAddr === ethers.ZeroAddress) {
        throw new Error("Pair does not exist");
      }

      const lpToken = getTokenContract(pairAddr, wallet.signer);
      await ensureApproval(lpToken, wallet.address, routerAddr, liquidity);

      // Step 2: Calculate minimum amounts from current position if not provided
      let minA = amountAMin;
      let minB = amountBMin;

      if (minA === 0n && minB === 0n) {
        const pool = getPoolContract(pairAddr, wallet.provider);
        const [underlyingA, underlyingB] = await pool.getUnderlyingTokens(liquidity);
        minA = calculateMinimumOut(underlyingA, slippagePct);
        minB = calculateMinimumOut(underlyingB, slippagePct);
      }

      // Step 3: Remove liquidity
      setStatus(LIQ_STATUS.SUBMITTING);
      const routerSigned = getRouterContract(wallet.signer, wallet.chainId);
      const deadline     = getDeadline(20);

      const tx = await routerSigned.removeLiquidity(
        tokenAAddress,
        tokenBAddress,
        liquidity,
        minA,
        minB,
        wallet.address,
        deadline
      );

      setTxHash(tx.hash);
      const receipt = await tx.wait();
      setStatus(LIQ_STATUS.CONFIRMED);

      return { receipt, txHash: tx.hash };
    } catch (err) {
      setStatus(LIQ_STATUS.FAILED);
      const msg = err?.reason || err?.message || "Remove liquidity failed";
      setError(msg.includes("user rejected") ? "Transaction rejected by user." : msg);
      return null;
    }
  }, [wallet]);

  // ── Get Position ──────────────────────────────────────────────
  const getPosition = useCallback(async (tokenAAddress, tokenBAddress) => {
    if (!wallet.provider || !wallet.chainId || !wallet.address) {
      setPosition(null);
      return null;
    }

    setLoadingPosition(true);
    try {
      const router    = getRouterContract(wallet.provider, wallet.chainId);
      const pairAddr  = await router.getPair(tokenAAddress, tokenBAddress);

      if (!pairAddr || pairAddr === ethers.ZeroAddress) {
        setPosition(null);
        return null;
      }

      const pool = getPoolContract(pairAddr, wallet.provider);

      const [
        lpBalance,
        totalSupply,
        reserves,
        spotPrice,
        shareBps,
        feesA,
        feesB,
      ] = await Promise.all([
        pool.balanceOf(wallet.address),
        pool.totalSupply(),
        pool.getReserves(),
        pool.getSpotPrice().catch(() => 0n),
        pool.getShareBasisPoints(wallet.address),
        pool.totalFeesEarnedA(),
        pool.totalFeesEarnedB(),
      ]);

      let underlyingA = 0n, underlyingB = 0n;
      if (lpBalance > 0n) {
        [underlyingA, underlyingB] = await pool.getUnderlyingTokens(lpBalance);
      }

      // Estimate APY (rough calculation)
      const apy = estimateAPY(feesA, feesB, reserves[0], reserves[1]);

      const pos = {
        pairAddress: pairAddr,
        lpBalance,
        totalSupply,
        reserveA: reserves[0],
        reserveB: reserves[1],
        spotPrice,
        shareBps,
        sharePercent: Number(shareBps) / 100,
        underlyingA,
        underlyingB,
        feesEarnedA: feesA,
        feesEarnedB: feesB,
        estimatedAPY: apy,
        hasPosition: lpBalance > 0n,
      };

      setPosition(pos);
      return pos;
    } catch (err) {
      setPosition(null);
      return null;
    } finally {
      setLoadingPosition(false);
    }
  }, [wallet.provider, wallet.chainId, wallet.address]);

  // ── Get optimal B amount for a given A ───────────────────────
  const getOptimalAmountB = useCallback(async (tokenAAddress, tokenBAddress, amountA) => {
    if (!wallet.provider || !wallet.chainId || !amountA || amountA === 0n) return null;
    try {
      const router   = getRouterContract(wallet.provider, wallet.chainId);
      const pairAddr = await router.getPair(tokenAAddress, tokenBAddress);
      if (!pairAddr || pairAddr === ethers.ZeroAddress) return amountA; // new pool, any ratio

      const pool = getPoolContract(pairAddr, wallet.provider);
      const [rA, rB] = await pool.getReserves();
      const token0 = await pool.tokenA();

      const [reserveA, reserveB] = token0.toLowerCase() === tokenAAddress.toLowerCase()
        ? [rA, rB]
        : [rB, rA];

      if (reserveA === 0n) return amountA;
      return calculateOptimalB(amountA, reserveA, reserveB);
    } catch {
      return null;
    }
  }, [wallet.provider, wallet.chainId]);

  return {
    status,
    txHash,
    error,
    position,
    loadingPosition,
    isPending: status === LIQ_STATUS.APPROVING || status === LIQ_STATUS.SUBMITTING,
    isConfirmed: status === LIQ_STATUS.CONFIRMED,
    isFailed: status === LIQ_STATUS.FAILED,
    addLiquidity,
    removeLiquidity,
    getPosition,
    getOptimalAmountB,
    reset,
  };
}
