import React, { useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";
import { useSwap, TX_STATUS } from "../hooks/useSwap.js";
import {
  formatTokenAmount,
  parseTokenAmount,
  calculatePriceImpact,
  calculateMinimumOut,
  getPriceImpactColor,
  getPriceImpactLabel,
  formatPercent,
} from "../utils/calculations.js";
import {
  getTokenList,
  getAddresses,
  getEtherscanTxLink,
  getTokenContract,
} from "../utils/contracts.js";

// ── Slippage options ──────────────────────────────────────────────
const SLIPPAGE_OPTIONS = [0.1, 0.5, 1.0];

// ── Token selector dropdown ───────────────────────────────────────
function TokenSelector({ tokens, selected, onChange, exclude }) {
  const [open, setOpen] = useState(false);
  const filtered = tokens.filter((t) => t.address !== exclude);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 rounded-xl px-3 py-2 text-sm font-semibold transition-colors min-w-[110px]"
      >
        <span
          className="w-5 h-5 rounded-full flex-shrink-0"
          style={{ backgroundColor: selected?.color || "#6366f1" }}
        />
        <span>{selected?.symbol || "Select"}</span>
        <span className="text-slate-400 text-xs ml-auto">▼</span>
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl min-w-[160px] py-1 animate-slide-up">
          {filtered.map((token) => (
            <button
              key={token.address}
              type="button"
              onClick={() => { onChange(token); setOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-slate-700 transition-colors text-left
                ${selected?.address === token.address ? "text-indigo-400 bg-slate-700/50" : "text-slate-200"}`}
            >
              <span
                className="w-6 h-6 rounded-full flex-shrink-0"
                style={{ backgroundColor: token.color }}
              />
              <div>
                <div className="font-semibold">{token.symbol}</div>
                <div className="text-xs text-slate-500">{token.name}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Transaction status display ────────────────────────────────────
function TxStatus({ status, txHash, error, chainId, onReset }) {
  if (status === TX_STATUS.IDLE) return null;

  const etherscanUrl = txHash ? getEtherscanTxLink(txHash, chainId ?? 11155111n) : null;

  return (
    <div className={`mt-4 p-4 rounded-xl border text-sm ${
      status === TX_STATUS.CONFIRMED ? "bg-emerald-900/30 border-emerald-700/50 text-emerald-300" :
      status === TX_STATUS.FAILED    ? "bg-red-900/30 border-red-700/50 text-red-300" :
                                        "bg-slate-800 border-slate-700 text-slate-300"
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          {(status === TX_STATUS.APPROVING || status === TX_STATUS.SWAPPING) && (
            <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin mt-0.5 flex-shrink-0" />
          )}
          {status === TX_STATUS.CONFIRMED && <span className="text-lg leading-none">✓</span>}
          {status === TX_STATUS.FAILED    && <span className="text-lg leading-none">✗</span>}
          <div>
            <div className="font-semibold">
              {status === TX_STATUS.APPROVING  && "Approving token..."}
              {status === TX_STATUS.SWAPPING   && "Swap pending..."}
              {status === TX_STATUS.CONFIRMED  && "Swap confirmed!"}
              {status === TX_STATUS.FAILED     && "Swap failed"}
            </div>
            {error && <div className="text-xs mt-1 opacity-80">{error}</div>}
            {etherscanUrl && (
              <a
                href={etherscanUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs underline mt-1 block opacity-70 hover:opacity-100"
              >
                View on Etherscan ↗
              </a>
            )}
          </div>
        </div>
        {(status === TX_STATUS.CONFIRMED || status === TX_STATUS.FAILED) && (
          <button onClick={onReset} className="text-slate-400 hover:text-slate-200 text-lg leading-none flex-shrink-0">✕</button>
        )}
      </div>
    </div>
  );
}

// ── Main SwapInterface ────────────────────────────────────────────
export default function SwapInterface({ wallet, onNotify }) {
  const tokens = getTokenList(wallet.chainId ?? 31337n);

  const [tokenIn,  setTokenIn]  = useState(tokens[0] || null);
  const [tokenOut, setTokenOut] = useState(tokens[1] || null);
  const [amountIn,  setAmountIn]  = useState("");
  const [amountOut, setAmountOut] = useState("");
  const [slippage, setSlippage]   = useState(0.5);
  const [customSlippage, setCustomSlippage] = useState("");
  const [priceImpact, setPriceImpact] = useState(0);
  const [balanceIn,  setBalanceIn]  = useState(null);
  const [balanceOut, setBalanceOut] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  const swap      = useSwap(wallet);
  const quoteTimer = useRef(null);

  const effectiveSlippage = customSlippage ? parseFloat(customSlippage) : slippage;

  // ── Fetch balances ──────────────────────────────────────────────
  const fetchBalances = useCallback(async () => {
    if (!wallet.provider || !wallet.address || !tokenIn || !tokenOut) return;
    try {
      const [tIn, tOut] = await Promise.all([
        getTokenContract(tokenIn.address, wallet.provider).balanceOf(wallet.address),
        getTokenContract(tokenOut.address, wallet.provider).balanceOf(wallet.address),
      ]);
      setBalanceIn(tIn);
      setBalanceOut(tOut);
    } catch {}
  }, [wallet.provider, wallet.address, tokenIn, tokenOut]);

  useEffect(() => { fetchBalances(); }, [fetchBalances]);

  // ── Get quote on amountIn change ────────────────────────────────
  useEffect(() => {
    if (quoteTimer.current) clearTimeout(quoteTimer.current);
    if (!amountIn || amountIn === "0" || !tokenIn || !tokenOut) {
      setAmountOut("");
      setPriceImpact(0);
      return;
    }

    quoteTimer.current = setTimeout(async () => {
      try {
        const parsed = parseTokenAmount(amountIn, 18);
        if (parsed === 0n) { setAmountOut(""); return; }

        const result = await swap.getQuote(tokenIn.address, tokenOut.address, parsed);
        if (result) {
          setAmountOut(formatTokenAmount(result.amountOut, 18, 6));
          setPriceImpact(result.priceImpact);
        }
      } catch {}
    }, 400);

    return () => clearTimeout(quoteTimer.current);
  }, [amountIn, tokenIn, tokenOut, swap.getQuote]);

  // ── Swap tokens (flip) ──────────────────────────────────────────
  const handleFlip = () => {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setAmountIn(amountOut);
    setAmountOut(amountIn);
  };

  // ── Max button ──────────────────────────────────────────────────
  const handleMax = () => {
    if (balanceIn) setAmountIn(formatTokenAmount(balanceIn, 18, 18));
  };

  // ── Execute swap ────────────────────────────────────────────────
  const handleSwap = async () => {
    if (!wallet.isConnected) { onNotify?.("error", "Not Connected", "Please connect your wallet first."); return; }
    if (!amountIn || !tokenIn || !tokenOut) return;

    const parsed = parseTokenAmount(amountIn, 18);
    if (parsed === 0n) return;

    const result = await swap.executeSwap({
      tokenInAddress:  tokenIn.address,
      tokenOutAddress: tokenOut.address,
      amountIn: parsed,
      slippagePct: effectiveSlippage,
    });

    if (result) {
      onNotify?.("success", "Swap Confirmed!", `Swapped ${amountIn} ${tokenIn.symbol} for ${amountOut} ${tokenOut.symbol}`, result.txHash);
      setAmountIn("");
      setAmountOut("");
      await fetchBalances();
    } else if (swap.error) {
      onNotify?.("error", "Swap Failed", swap.error);
    }
  };

  const amountInParsed  = parseTokenAmount(amountIn,  18);
  const amountOutParsed = parseTokenAmount(amountOut, 18);
  const minOut = amountOutParsed > 0n ? calculateMinimumOut(amountOutParsed, effectiveSlippage) : 0n;

  const isInsufficient = balanceIn && amountInParsed > balanceIn;
  const canSwap = wallet.isConnected && amountInParsed > 0n && amountOutParsed > 0n && !isInsufficient && !swap.isPending;

  return (
    <div className="w-full max-w-md">
      <div className="card">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-100">Swap</h2>
          <button
            onClick={() => setShowSettings((s) => !s)}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            title="Swap settings"
          >
            ⚙
          </button>
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div className="mb-5 p-4 bg-slate-800/50 rounded-xl border border-slate-700 animate-slide-up">
            <p className="text-xs text-slate-400 mb-3 font-medium uppercase tracking-wider">Slippage Tolerance</p>
            <div className="flex items-center gap-2">
              {SLIPPAGE_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setSlippage(s); setCustomSlippage(""); }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    slippage === s && !customSlippage
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                  }`}
                >
                  {s}%
                </button>
              ))}
              <div className="flex items-center gap-1 bg-slate-700 rounded-lg px-2 py-1.5 flex-1">
                <input
                  type="number"
                  value={customSlippage}
                  onChange={(e) => setCustomSlippage(e.target.value)}
                  placeholder="Custom"
                  className="bg-transparent text-sm text-slate-100 outline-none w-full placeholder-slate-500"
                  min="0.01"
                  max="50"
                  step="0.1"
                />
                <span className="text-slate-400 text-sm">%</span>
              </div>
            </div>
          </div>
        )}

        {/* Token In */}
        <div className="bg-slate-800 rounded-xl p-4 mb-2 border border-slate-700 focus-within:border-indigo-500/50 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500">You Pay</span>
            {balanceIn !== null && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Balance: {formatTokenAmount(balanceIn, 18, 4)}</span>
                <button
                  onClick={handleMax}
                  className="text-indigo-400 hover:text-indigo-300 font-semibold transition-colors"
                >
                  MAX
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={amountIn}
              onChange={(e) => setAmountIn(e.target.value)}
              placeholder="0.0"
              className="bg-transparent text-2xl font-semibold text-slate-100 outline-none flex-1 min-w-0 placeholder-slate-600"
              min="0"
            />
            <TokenSelector
              tokens={tokens}
              selected={tokenIn}
              onChange={setTokenIn}
              exclude={tokenOut?.address}
            />
          </div>
        </div>

        {/* Flip button */}
        <div className="flex justify-center my-1 relative z-10">
          <button
            onClick={handleFlip}
            className="w-9 h-9 bg-slate-700 hover:bg-slate-600 border-2 border-slate-900 rounded-xl flex items-center justify-center text-slate-300 hover:text-white transition-all active:scale-95"
            title="Flip tokens"
          >
            ⇅
          </button>
        </div>

        {/* Token Out */}
        <div className="bg-slate-800 rounded-xl p-4 mb-5 border border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500">You Receive</span>
            {balanceOut !== null && (
              <span className="text-xs text-slate-500">
                Balance: {formatTokenAmount(balanceOut, 18, 4)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-2xl font-semibold flex-1 min-w-0 truncate">
              {swap.loadingQuote ? (
                <span className="text-slate-500 text-lg animate-pulse">Calculating...</span>
              ) : (
                <span className={amountOut ? "text-slate-100" : "text-slate-600"}>
                  {amountOut || "0.0"}
                </span>
              )}
            </div>
            <TokenSelector
              tokens={tokens}
              selected={tokenOut}
              onChange={setTokenOut}
              exclude={tokenIn?.address}
            />
          </div>
        </div>

        {/* Swap details */}
        {amountIn && amountOut && (
          <div className="mb-5 space-y-2 text-sm">
            <div className="flex justify-between text-slate-400">
              <span>Rate</span>
              <span className="text-slate-200">
                1 {tokenIn?.symbol} = {
                  amountIn && amountOut && parseFloat(amountIn) > 0
                    ? (parseFloat(amountOut) / parseFloat(amountIn)).toFixed(6)
                    : "—"
                } {tokenOut?.symbol}
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Price Impact</span>
              <span className={getPriceImpactColor(priceImpact)}>
                {formatPercent(priceImpact)} ({getPriceImpactLabel(priceImpact)})
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Min. Received ({effectiveSlippage}% slippage)</span>
              <span className="text-slate-200">
                {formatTokenAmount(minOut, 18, 6)} {tokenOut?.symbol}
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Fee</span>
              <span className="text-slate-200">0.3%</span>
            </div>
          </div>
        )}

        {/* High price impact warning */}
        {priceImpact > 3 && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-700/50 rounded-xl text-red-300 text-sm">
            ⚠ High price impact ({formatPercent(priceImpact)}). Consider reducing swap size.
          </div>
        )}

        {/* Swap button */}
        <button
          onClick={handleSwap}
          disabled={!canSwap}
          className="btn-primary w-full text-base"
        >
          {!wallet.isConnected ? "Connect Wallet" :
           isInsufficient      ? `Insufficient ${tokenIn?.symbol} balance` :
           swap.isPending      ? (
             <span className="flex items-center justify-center gap-2">
               <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
               {swap.status === TX_STATUS.APPROVING ? "Approving..." : "Swapping..."}
             </span>
           ) : "Swap"}
        </button>

        {/* Tx status */}
        <TxStatus
          status={swap.status}
          txHash={swap.txHash}
          error={swap.error}
          chainId={wallet.chainId}
          onReset={swap.reset}
        />
      </div>
    </div>
  );
}
