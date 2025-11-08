/**
 * useSwap.js
 * React hook for executing token swaps on HamzaDEX.
 * Handles quotes, approvals, and swap execution with status tracking.
 */

import { useState, useCallback } from "react";
import { ethers } from "ethers";
import {
  getRouterContract,
  getTokenContract,
  getAddresses,
  getDeadline,
  ensureApproval,
} from "../utils/contracts.js";
import {
  calculatePriceImpact,
  calculateMinimumOut,
  formatTokenAmount,
} from "../utils/calculations.js";

// Transaction status enum
export const TX_STATUS = {
  IDLE:       "idle",
  APPROVING:  "approving",
  SWAPPING:   "swapping",
  CONFIRMED:  "confirmed",
  FAILED:     "failed",
};

export function useSwap(wallet) {
  const [status, setStatus]           = useState(TX_STATUS.IDLE);
  const [txHash, setTxHash]           = useState(null);
  const [error, setError]             = useState(null);
  const [quote, setQuote]             = useState(null);
  const [loadingQuote, setLoadingQuote] = useState(false);

  const reset = useCallback(() => {
    setStatus(TX_STATUS.IDLE);
    setTxHash(null);
    setError(null);
  }, []);

  // ── Get quote for a swap ──────────────────────────────────────
  const getQuote = useCallback(async (tokenInAddress, tokenOutAddress, amountIn) => {
    if (!wallet.provider || !wallet.chainId) {
      setQuote(null);
      return null;
    }
    if (!amountIn || amountIn === 0n) {
      setQuote(null);
      return null;
    }

    setLoadingQuote(true);
    try {
      const router = getRouterContract(wallet.provider, wallet.chainId);
      const path   = [tokenInAddress, tokenOutAddress];

      // Get output amounts
      const amounts = await router.getAmountsOut(amountIn, path);
      const amountOut = amounts[amounts.length - 1];

      // Get reserves for price impact calculation
      const pairAddress = await router.getPair(tokenInAddress, tokenOutAddress);
      let priceImpact = 0;

      if (pairAddress && pairAddress !== ethers.ZeroAddress) {
        const { ethers: ethersLib } = await import("ethers");
        const poolAbi = [
          "function tokenA() view returns (address)",
          "function getReserves() view returns (uint112, uint112, uint32)",
        ];
        const pool = new ethersLib.Contract(pairAddress, poolAbi, wallet.provider);
        const token0 = await pool.tokenA();
        const [r0, r1] = await pool.getReserves();

        const [reserveIn, reserveOut] = token0.toLowerCase() === tokenInAddress.toLowerCase()
          ? [r0, r1]
          : [r1, r0];

        priceImpact = calculatePriceImpact(amountIn, reserveIn, reserveOut);
      }

      // Spot price
      let spotPrice = null;
      try {
        spotPrice = await router.getPrice(tokenInAddress, tokenOutAddress);
      } catch {}

      const result = {
        amountIn,
        amountOut,
        path,
        priceImpact,
        spotPrice,
        executionPrice: amountOut > 0n ? (amountIn * (10n ** 18n)) / amountOut : 0n,
      };

      setQuote(result);
      return result;
    } catch (err) {
      setQuote(null);
      return null;
    } finally {
      setLoadingQuote(false);
    }
  }, [wallet.provider, wallet.chainId]);

  // ── Get multi-hop quote ───────────────────────────────────────
  const getMultiHopQuote = useCallback(async (path, amountIn) => {
    if (!wallet.provider || !wallet.chainId || !amountIn || amountIn === 0n) {
      return null;
    }
    try {
      const router  = getRouterContract(wallet.provider, wallet.chainId);
      const amounts = await router.getAmountsOut(amountIn, path);
      return amounts;
    } catch {
      return null;
    }
  }, [wallet.provider, wallet.chainId]);

  // ── Execute swap ──────────────────────────────────────────────
  const executeSwap = useCallback(async ({
    tokenInAddress,
    tokenOutAddress,
    amountIn,
    amountOutMin,
    slippagePct = 0.5,
    path,
    recipient,
  }) => {
    if (!wallet.signer || !wallet.chainId) {
      setError("Wallet not connected.");
      return null;
    }

    setError(null);
    setTxHash(null);

    const swapPath = path || [tokenInAddress, tokenOutAddress];

    try {
      // Step 1: Approve token spending
      setStatus(TX_STATUS.APPROVING);
      const addresses  = getAddresses(wallet.chainId);
      const routerAddr = addresses?.HamzaSwap;
      if (!routerAddr) throw new Error("Router not deployed on this network");

      const tokenIn  = getTokenContract(tokenInAddress, wallet.signer);
      const approvalReceipt = await ensureApproval(
        tokenIn,
        wallet.address,
        routerAddr,
        amountIn
      );
      if (approvalReceipt) {
        // Approval was needed and submitted — wait for confirmation handled in ensureApproval
      }

      // Step 2: Execute swap
      setStatus(TX_STATUS.SWAPPING);
      const router = getRouterContract(wallet.signer, wallet.chainId);

      // If amountOutMin not provided, calculate from slippage
      let minOut = amountOutMin;
      if (minOut === undefined || minOut === null) {
        const amounts = await router.getAmountsOut(amountIn, swapPath);
        minOut = calculateMinimumOut(amounts[amounts.length - 1], slippagePct);
      }

      const deadline = getDeadline(20);
      const tx = await router.swapExactTokensForTokens(
        amountIn,
        minOut,
        swapPath,
        recipient || wallet.address,
        deadline
      );

      setTxHash(tx.hash);

      const receipt = await tx.wait();
      setStatus(TX_STATUS.CONFIRMED);

      return { receipt, txHash: tx.hash };
    } catch (err) {
      setStatus(TX_STATUS.FAILED);
      const msg = err?.reason || err?.message || "Swap failed";
      setError(msg.includes("user rejected") ? "Transaction rejected by user." : msg);
      return null;
    }
  }, [wallet]);

  // ── Approve token ─────────────────────────────────────────────
  const approveToken = useCallback(async (tokenAddress, spenderAddress, amount) => {
    if (!wallet.signer) {
      setError("Wallet not connected.");
      return null;
    }
    try {
      setStatus(TX_STATUS.APPROVING);
      const token = getTokenContract(tokenAddress, wallet.signer);
      const tx    = await token.approve(spenderAddress, amount ?? ethers.MaxUint256);
      setTxHash(tx.hash);
      const receipt = await tx.wait();
      setStatus(TX_STATUS.IDLE);
      return receipt;
    } catch (err) {
      setStatus(TX_STATUS.FAILED);
      setError(err?.message || "Approval failed");
      return null;
    }
  }, [wallet.signer]);

  // ── Check approval ────────────────────────────────────────────
  const checkAllowance = useCallback(async (tokenAddress, spenderAddress) => {
    if (!wallet.provider || !wallet.address) return 0n;
    try {
      const token = getTokenContract(tokenAddress, wallet.provider);
      return await token.allowance(wallet.address, spenderAddress);
    } catch {
      return 0n;
    }
  }, [wallet.provider, wallet.address]);

  return {
    status,
    txHash,
    error,
    quote,
    loadingQuote,
    isPending: status === TX_STATUS.APPROVING || status === TX_STATUS.SWAPPING,
    isConfirmed: status === TX_STATUS.CONFIRMED,
    isFailed: status === TX_STATUS.FAILED,
    getQuote,
    getMultiHopQuote,
    executeSwap,
    approveToken,
    checkAllowance,
    reset,
  };
}
