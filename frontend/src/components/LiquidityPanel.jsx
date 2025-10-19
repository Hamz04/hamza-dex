import React, { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { useLiquidity, LIQ_STATUS } from "../hooks/useLiquidity.js";
import {
  formatTokenAmount,
  parseTokenAmount,
  formatPercent,
  calculateLPTokens,
  bigintSqrt,
  estimateAPY,
} from "../utils/calculations.js";
import {
  getTokenList,
  getEtherscanTxLink,
  getTokenContract,
  getAddresses,
} from "../utils/contracts.js";

// ── Status Banner ─────────────────────────────────────────────────
function StatusBanner({ status, txHash, error, chainId, onReset }) {
  if (status === LIQ_STATUS.IDLE) return null;
  return (
    <div className={`mt-4 p-4 rounded-xl border text-sm ${
      status === LIQ_STATUS.CONFIRMED ? "bg-emerald-900/30 border-emerald-700/50 text-emerald-300" :
      status === LIQ_STATUS.FAILED    ? "bg-red-900/30 border-red-700/50 text-red-300" :
                                         "bg-slate-800 border-slate-700 text-slate-300"
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {(status === LIQ_STATUS.APPROVING || status === LIQ_STATUS.SUBMITTING) && (
            <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
          )}
          <div>
            <div className="font-semibold">
              {status === LIQ_STATUS.APPROVING  && "Approving tokens..."}
              {status === LIQ_STATUS.SUBMITTING  && "Submitting transaction..."}
              {status === LIQ_STATUS.CONFIRMED   && "Transaction confirmed!"}
              {status === LIQ_STATUS.FAILED      && "Transaction failed"}
            </div>
            {error && <div className="text-xs mt-1 opacity-80">{error}</div>}
            {txHash && (
              <a href={getEtherscanTxLink(txHash, chainId ?? 11155111n)} target="_blank" rel="noopener noreferrer"
                className="text-xs underline mt-1 block opacity-70 hover:opacity-100">
                View on Etherscan ↗
              </a>
            )}
          </div>
        </div>
        {(status === LIQ_STATUS.CONFIRMED || status === LIQ_STATUS.FAILED) && (
          <button onClick={onReset} className="text-slate-400 hover:text-slate-200">✕</button>
        )}
      </div>
    </div>
  );
}

// ── Pool Position Card ────────────────────────────────────────────
function PositionCard({ position, tokenA, tokenB }) {
  if (!position?.hasPosition) return null;
  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700 p-4 mb-5">
      <h3 className="text-sm font-semibold text-slate-300 mb-3">Your Position</h3>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between text-slate-400">
          <span>Pool Share</span>
          <span className="text-slate-100 font-medium">{formatPercent(position.sharePercent)}</span>
        </div>
        <div className="flex justify-between text-slate-400">
          <span>LP Tokens</span>
          <span className="text-slate-100 font-medium tabular-nums">
            {formatTokenAmount(position.lpBalance, 18, 6)}
          </span>
        </div>
        <div className="border-t border-slate-700 pt-2 mt-2">
          <div className="flex justify-between text-slate-400">
            <span>{tokenA?.symbol} in pool</span>
            <span className="text-slate-100 tabular-nums">
              {formatTokenAmount(position.underlyingA, 18, 6)}
            </span>
          </div>
          <div className="flex justify-between text-slate-400 mt-1">
            <span>{tokenB?.symbol} in pool</span>
            <span className="text-slate-100 tabular-nums">
              {formatTokenAmount(position.underlyingB, 18, 6)}
            </span>
          </div>
        </div>
        <div className="flex justify-between text-slate-400 border-t border-slate-700 pt-2">
          <span>Est. APY</span>
          <span className="text-emerald-400 font-semibold">
            {position.estimatedAPY > 0 ? formatPercent(position.estimatedAPY) : "Calculating..."}
          </span>
        </div>
        <div className="flex justify-between text-slate-400">
          <span>Total Fees Earned</span>
          <span className="text-slate-100 tabular-nums text-xs">
            {formatTokenAmount(position.feesEarnedA, 18, 4)} {tokenA?.symbol} /&nbsp;
            {formatTokenAmount(position.feesEarnedB, 18, 4)} {tokenB?.symbol}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Add Liquidity Tab ─────────────────────────────────────────────
function AddLiquidityTab({ wallet, tokens, liq, onNotify }) {
  const [tokenA, setTokenA] = useState(tokens[0] || null);
  const [tokenB, setTokenB] = useState(tokens[1] || null);
  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");
  const [balA, setBalA] = useState(null);
  const [balB, setBalB] = useState(null);
  const [optimizing, setOptimizing] = useState(false);

  const fetchBals = useCallback(async () => {
    if (!wallet.provider || !wallet.address || !tokenA || !tokenB) return;
    try {
      const [bA, bB] = await Promise.all([
        getTokenContract(tokenA.address, wallet.provider).balanceOf(wallet.address),
        getTokenContract(tokenB.address, wallet.provider).balanceOf(wallet.address),
      ]);
      setBalA(bA); setBalB(bB);
    } catch {}
  }, [wallet.provider, wallet.address, tokenA, tokenB]);

  useEffect(() => { fetchBals(); }, [fetchBals]);

  // Compute optimal B when A changes
  useEffect(() => {
    if (!amountA || amountA === "0" || !tokenA || !tokenB) return;
    const parsed = parseTokenAmount(amountA, 18);
    if (parsed === 0n) return;

    setOptimizing(true);
    liq.getOptimalAmountB(tokenA.address, tokenB.address, parsed).then((opt) => {
      if (opt) setAmountB(formatTokenAmount(opt, 18, 6));
    }).finally(() => setOptimizing(false));
  }, [amountA, tokenA, tokenB]);

  const handleAdd = async () => {
    if (!wallet.isConnected) { onNotify?.("error", "Not Connected", "Connect wallet first."); return; }
    const pA = parseTokenAmount(amountA, 18);
    const pB = parseTokenAmount(amountB, 18);
    if (pA === 0n || pB === 0n) return;

    const result = await liq.addLiquidity({
      tokenAAddress: tokenA.address,
      tokenBAddress: tokenB.address,
      amountA: pA,
      amountB: pB,
    });

    if (result) {
      onNotify?.("success", "Liquidity Added!", `Added ${amountA} ${tokenA.symbol} + ${amountB} ${tokenB.symbol}`, result.txHash);
      setAmountA(""); setAmountB("");
      await fetchBals();
    } else if (liq.error) {
      onNotify?.("error", "Failed", liq.error);
    }
  };

  const pA = parseTokenAmount(amountA, 18);
  const pB = parseTokenAmount(amountB, 18);
  const insuffA = balA && pA > balA;
  const insuffB = balB && pB > balB;
  const canAdd = wallet.isConnected && pA > 0n && pB > 0n && !insuffA && !insuffB && !liq.isPending;

  return (
    <div>
      {/* Token A */}
      <div className="bg-slate-800 rounded-xl p-4 mb-3 border border-slate-700">
        <div className="flex justify-between text-xs text-slate-500 mb-2">
          <span>{tokens.find(t=>t.address===tokenA?.address)?.symbol || "Token A"}</span>
          {balA !== null && <span>Balance: {formatTokenAmount(balA,18,4)}</span>}
        </div>
        <div className="flex gap-3 items-center">
          <input
            type="number" value={amountA}
            onChange={e=>setAmountA(e.target.value)}
            placeholder="0.0"
            className="bg-transparent text-xl font-semibold text-slate-100 outline-none flex-1 placeholder-slate-600"
          />
          <select
            value={tokenA?.address || ""}
            onChange={e => setTokenA(tokens.find(t=>t.address===e.target.value))}
            className="bg-slate-700 text-sm text-slate-100 rounded-lg px-2 py-1.5 outline-none border border-slate-600"
          >
            {tokens.filter(t=>t.address!==tokenB?.address).map(t=>(
              <option key={t.address} value={t.address}>{t.symbol}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex justify-center mb-3 text-slate-500">+</div>

      {/* Token B */}
      <div className="bg-slate-800 rounded-xl p-4 mb-5 border border-slate-700">
        <div className="flex justify-between text-xs text-slate-500 mb-2">
          <span>{tokens.find(t=>t.address===tokenB?.address)?.symbol || "Token B"}</span>
          {balB !== null && <span>Balance: {formatTokenAmount(balB,18,4)}</span>}
        </div>
        <div className="flex gap-3 items-center">
          <input
            type="number" value={amountB}
            onChange={e=>setAmountB(e.target.value)}
            placeholder={optimizing ? "Calculating..." : "0.0"}
            className="bg-transparent text-xl font-semibold text-slate-100 outline-none flex-1 placeholder-slate-600"
          />
          <select
            value={tokenB?.address || ""}
            onChange={e => setTokenB(tokens.find(t=>t.address===e.target.value))}
            className="bg-slate-700 text-sm text-slate-100 rounded-lg px-2 py-1.5 outline-none border border-slate-600"
          >
            {tokens.filter(t=>t.address!==tokenA?.address).map(t=>(
              <option key={t.address} value={t.address}>{t.symbol}</option>
            ))}
          </select>
        </div>
      </div>

      {(insuffA || insuffB) && (
        <p className="text-red-400 text-sm mb-3">
          Insufficient {insuffA ? tokenA?.symbol : tokenB?.symbol} balance
        </p>
      )}

      <button onClick={handleAdd} disabled={!canAdd} className="btn-primary w-full">
        {!wallet.isConnected ? "Connect Wallet" :
         liq.isPending ? (
           <span className="flex items-center justify-center gap-2">
             <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
             {liq.status === LIQ_STATUS.APPROVING ? "Approving..." : "Adding..."}
           </span>
         ) : "Add Liquidity"}
      </button>
    </div>
  );
}

// ── Remove Liquidity Tab ──────────────────────────────────────────
function RemoveLiquidityTab({ wallet, tokens, liq, onNotify }) {
  const [tokenA, setTokenA] = useState(tokens[0] || null);
  const [tokenB, setTokenB] = useState(tokens[1] || null);
  const [percent, setPercent] = useState(50);

  useEffect(() => {
    if (tokenA && tokenB) liq.getPosition(tokenA.address, tokenB.address);
  }, [tokenA, tokenB, liq.getPosition]);

  const pos = liq.position;
  const lpToRemove = pos?.lpBalance ? (pos.lpBalance * BigInt(percent)) / 100n : 0n;

  const handleRemove = async () => {
    if (!wallet.isConnected || !pos?.hasPosition || lpToRemove === 0n) return;

    const result = await liq.removeLiquidity({
      tokenAAddress: tokenA.address,
      tokenBAddress: tokenB.address,
      liquidity: lpToRemove,
    });

    if (result) {
      onNotify?.("success", "Liquidity Removed!", `Removed ${percent}% of your ${tokenA?.symbol}/${tokenB?.symbol} position`, result.txHash);
      await liq.getPosition(tokenA.address, tokenB.address);
    } else if (liq.error) {
      onNotify?.("error", "Failed", liq.error);
    }
  };

  return (
    <div>
      {/* Pair selector */}
      <div className="flex items-center gap-3 mb-5">
        <select value={tokenA?.address||""} onChange={e=>setTokenA(tokens.find(t=>t.address===e.target.value))}
          className="flex-1 bg-slate-800 border border-slate-700 text-slate-100 rounded-xl px-3 py-2.5 outline-none text-sm">
          {tokens.filter(t=>t.address!==tokenB?.address).map(t=>(
            <option key={t.address} value={t.address}>{t.symbol}</option>
          ))}
        </select>
        <span className="text-slate-500">/</span>
        <select value={tokenB?.address||""} onChange={e=>setTokenB(tokens.find(t=>t.address===e.target.value))}
          className="flex-1 bg-slate-800 border border-slate-700 text-slate-100 rounded-xl px-3 py-2.5 outline-none text-sm">
          {tokens.filter(t=>t.address!==tokenA?.address).map(t=>(
            <option key={t.address} value={t.address}>{t.symbol}</option>
          ))}
        </select>
      </div>

      <PositionCard position={pos} tokenA={tokenA} tokenB={tokenB} />

      {pos?.hasPosition ? (
        <>
          {/* Percentage slider */}
          <div className="mb-5">
            <div className="flex justify-between text-sm text-slate-400 mb-3">
              <span>Amount to Remove</span>
              <span className="text-slate-100 font-bold text-lg">{percent}%</span>
            </div>
            <input
              type="range" min="1" max="100" value={percent}
              onChange={e=>setPercent(Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
            <div className="flex justify-between mt-2 gap-2">
              {[25,50,75,100].map(p=>(
                <button key={p} onClick={()=>setPercent(p)}
                  className={`flex-1 text-xs py-1.5 rounded-lg transition-colors font-medium ${
                    percent===p ? "bg-indigo-600 text-white" : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                  }`}>{p}%</button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="bg-slate-800/50 rounded-xl p-4 mb-5 border border-slate-700 text-sm space-y-2">
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">You will receive</div>
            <div className="flex justify-between text-slate-300">
              <span>{tokenA?.symbol}</span>
              <span className="font-medium tabular-nums">
                ~{formatTokenAmount((pos.underlyingA * BigInt(percent)) / 100n, 18, 6)}
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>{tokenB?.symbol}</span>
              <span className="font-medium tabular-nums">
                ~{formatTokenAmount((pos.underlyingB * BigInt(percent)) / 100n, 18, 6)}
              </span>
            </div>
          </div>

          <button onClick={handleRemove} disabled={liq.isPending || lpToRemove===0n} className="btn-primary w-full">
            {liq.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                {liq.status === LIQ_STATUS.APPROVING ? "Approving LP..." : "Removing..."}
              </span>
            ) : `Remove ${percent}% Liquidity`}
          </button>
        </>
      ) : (
        <div className="text-center py-8 text-slate-500">
          {liq.loadingPosition ? (
            <span className="animate-pulse">Loading position...</span>
          ) : (
            <span>No liquidity position found for this pair.</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main LiquidityPanel ───────────────────────────────────────────
export default function LiquidityPanel({ wallet, onNotify }) {
  const [tab, setTab] = useState("add");
  const tokens = getTokenList(wallet.chainId ?? 31337n);
  const liq = useLiquidity(wallet);

  return (
    <div className="w-full max-w-md">
      <div className="card">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-100">Liquidity</h2>
          <div className="flex gap-1 bg-slate-800 p-1 rounded-xl">
            <button onClick={()=>setTab("add")}
              className={tab==="add" ? "tab-btn-active" : "tab-btn-inactive"}>
              Add
            </button>
            <button onClick={()=>setTab("remove")}
              className={tab==="remove" ? "tab-btn-active" : "tab-btn-inactive"}>
              Remove
            </button>
          </div>
        </div>

        {tab === "add" ? (
          <AddLiquidityTab wallet={wallet} tokens={tokens} liq={liq} onNotify={onNotify} />
        ) : (
          <RemoveLiquidityTab wallet={wallet} tokens={tokens} liq={liq} onNotify={onNotify} />
        )}

        <StatusBanner
          status={liq.status}
          txHash={liq.txHash}
          error={liq.error}
          chainId={wallet.chainId}
          onReset={liq.reset}
        />
      </div>
    </div>
  );
}
