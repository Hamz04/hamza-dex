import React, { useEffect, useRef, useState, useCallback } from "react";
import { createChart, ColorType, LineStyle } from "lightweight-charts";
import { ethers } from "ethers";
import {
  getRouterContract,
  getPoolContract,
  getTokenList,
  LIQUIDITY_POOL_ABI,
} from "../utils/contracts.js";
import { formatTokenAmount } from "../utils/calculations.js";

// ── Pair selector ─────────────────────────────────────────────────
const TIMEFRAMES = [
  { label: "1H",  hours: 1   },
  { label: "6H",  hours: 6   },
  { label: "24H", hours: 24  },
  { label: "7D",  hours: 168 },
];

function buildMockHistory(currentPrice, hours, points = 60) {
  // Generates realistic-looking mock OHLCV data for demo purposes
  // In production, replace with on-chain event indexing or a subgraph
  const now   = Math.floor(Date.now() / 1000);
  const step  = Math.floor((hours * 3600) / points);
  const data  = [];
  let price   = currentPrice * (0.85 + Math.random() * 0.3);

  for (let i = points; i >= 0; i--) {
    const time  = now - i * step;
    const open  = price;
    const vol   = price * (0.005 + Math.random() * 0.02);
    const close = price + (Math.random() - 0.48) * vol * 2;
    const high  = Math.max(open, close) + Math.random() * vol;
    const low   = Math.min(open, close) - Math.random() * vol;
    data.push({ time, open, high, low, close: Math.max(close, 0.000001) });
    price = close;
  }

  return data;
}

async function fetchPriceHistory(provider, chainId, tokenAAddress, tokenBAddress, hours) {
  try {
    const router  = getRouterContract(provider, chainId);
    const pairAddr = await router.getPair(tokenAAddress, tokenBAddress);
    if (!pairAddr || pairAddr === ethers.ZeroAddress) return null;

    const pool = getPoolContract(pairAddr, provider);

    // Fetch current spot price
    let spotPrice = 0;
    try {
      const raw = await pool.getSpotPrice();
      spotPrice = Number(raw) / 1e18;
    } catch { spotPrice = 1; }

    // In production: query Swap events from the pool contract for real history
    // For now, generate plausible mock data seeded from the real spot price
    const history = buildMockHistory(spotPrice, hours);
    return { history, spotPrice, pairAddr };
  } catch {
    return null;
  }
}

// ── Chart component ───────────────────────────────────────────────
export default function PriceChart({ wallet }) {
  const chartContainerRef = useRef(null);
  const chartRef          = useRef(null);
  const seriesRef         = useRef(null);

  const tokens    = getTokenList(wallet.chainId ?? 31337n);
  const [tokenA, setTokenA] = useState(tokens[0] || null);
  const [tokenB, setTokenB] = useState(tokens[1] || null);
  const [timeframe, setTimeframe] = useState(TIMEFRAMES[2]); // 24H default
  const [loading, setLoading]     = useState(false);
  const [spotPrice, setSpotPrice] = useState(null);
  const [pairAddr, setPairAddr]   = useState(null);
  const [reserves, setReserves]   = useState(null);
  const [priceChange, setPriceChange] = useState(null);

  // ── Initialise chart ────────────────────────────────────────────
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0f172a" },
        textColor: "#94a3b8",
      },
      grid: {
        vertLines: { color: "#1e293b", style: LineStyle.Dotted },
        horzLines: { color: "#1e293b", style: LineStyle.Dotted },
      },
      crosshair: {
        mode: 1,
        vertLine: { color: "#6366f1", style: LineStyle.Dashed, width: 1 },
        horzLine: { color: "#6366f1", style: LineStyle.Dashed, width: 1 },
      },
      rightPriceScale: {
        borderColor: "#1e293b",
        textColor: "#64748b",
      },
      timeScale: {
        borderColor: "#1e293b",
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
      handleScale:  { mouseWheel: true, pinch: true },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor:         "#10b981",
      downColor:       "#ef4444",
      borderUpColor:   "#10b981",
      borderDownColor: "#ef4444",
      wickUpColor:     "#10b981",
      wickDownColor:   "#ef4444",
    });

    chartRef.current  = chart;
    seriesRef.current = candleSeries;

    // Responsive resize
    const resizeObserver = new ResizeObserver(() => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    });
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current  = null;
      seriesRef.current = null;
    };
  }, []);

  // ── Load data ───────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!tokenA || !tokenB || !wallet.provider || !wallet.chainId) return;
    setLoading(true);

    const result = await fetchPriceHistory(
      wallet.provider,
      wallet.chainId,
      tokenA.address,
      tokenB.address,
      timeframe.hours
    );

    if (result && seriesRef.current) {
      seriesRef.current.setData(result.history);
      chartRef.current?.timeScale().fitContent();

      setSpotPrice(result.spotPrice);
      setPairAddr(result.pairAddr);

      // Calculate 24h price change
      if (result.history.length >= 2) {
        const first = result.history[0].open;
        const last  = result.history[result.history.length - 1].close;
        setPriceChange(((last - first) / first) * 100);
      }

      // Fetch reserves
      try {
        const pool = getPoolContract(result.pairAddr, wallet.provider);
        const [rA, rB] = await pool.getReserves();
        const token0   = await pool.tokenA();
        const [resA, resB] = token0.toLowerCase() === tokenA.address.toLowerCase()
          ? [rA, rB] : [rB, rA];
        setReserves({ a: resA, b: resB });
      } catch {}
    }

    setLoading(false);
  }, [tokenA, tokenB, wallet.provider, wallet.chainId, timeframe]);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  const isPositive = priceChange !== null && priceChange >= 0;

  return (
    <div className="card w-full">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          {/* Pair selector */}
          <div className="flex items-center gap-2 mb-2">
            <select
              value={tokenA?.address || ""}
              onChange={e => setTokenA(tokens.find(t => t.address === e.target.value))}
              className="bg-slate-800 border border-slate-700 text-slate-100 rounded-lg px-2 py-1.5 text-sm outline-none"
            >
              {tokens.filter(t => t.address !== tokenB?.address).map(t => (
                <option key={t.address} value={t.address}>{t.symbol}</option>
              ))}
            </select>
            <span className="text-slate-500">/</span>
            <select
              value={tokenB?.address || ""}
              onChange={e => setTokenB(tokens.find(t => t.address === e.target.value))}
              className="bg-slate-800 border border-slate-700 text-slate-100 rounded-lg px-2 py-1.5 text-sm outline-none"
            >
              {tokens.filter(t => t.address !== tokenA?.address).map(t => (
                <option key={t.address} value={t.address}>{t.symbol}</option>
              ))}
            </select>
          </div>

          {/* Price display */}
          {spotPrice !== null && (
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold text-slate-100 tabular-nums">
                {spotPrice.toFixed(6)}
              </span>
              <span className="text-sm text-slate-400">{tokenB?.symbol} per {tokenA?.symbol}</span>
              {priceChange !== null && (
                <span className={`text-sm font-semibold ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                  {isPositive ? "+" : ""}{priceChange.toFixed(2)}%
                </span>
              )}
            </div>
          )}
        </div>

        {/* Timeframe buttons */}
        <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl">
          {TIMEFRAMES.map(tf => (
            <button
              key={tf.label}
              onClick={() => setTimeframe(tf)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                timeframe.label === tf.label
                  ? "bg-indigo-600 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {tf.label}
            </button>
          ))}
          <button
            onClick={loadData}
            className="px-2 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
            title="Refresh"
          >
            ↻
          </button>
        </div>
      </div>

      {/* Stats row */}
      {reserves && (
        <div className="flex flex-wrap gap-6 mb-4 text-sm text-slate-400 border-b border-slate-800 pb-4">
          <div>
            <span className="text-slate-500 text-xs uppercase tracking-wider block mb-0.5">
              {tokenA?.symbol} Reserve
            </span>
            <span className="text-slate-200 font-medium tabular-nums">
              {formatTokenAmount(reserves.a, 18, 2)}
            </span>
          </div>
          <div>
            <span className="text-slate-500 text-xs uppercase tracking-wider block mb-0.5">
              {tokenB?.symbol} Reserve
            </span>
            <span className="text-slate-200 font-medium tabular-nums">
              {formatTokenAmount(reserves.b, 18, 2)}
            </span>
          </div>
          <div>
            <span className="text-slate-500 text-xs uppercase tracking-wider block mb-0.5">Fee</span>
            <span className="text-slate-200 font-medium">0.3%</span>
          </div>
          {pairAddr && (
            <div>
              <span className="text-slate-500 text-xs uppercase tracking-wider block mb-0.5">Pool</span>
              <a
                href={`https://sepolia.etherscan.io/address/${pairAddr}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 hover:text-indigo-300 font-mono text-xs underline"
              >
                {pairAddr.slice(0, 6)}...{pairAddr.slice(-4)}
              </a>
            </div>
          )}
        </div>
      )}

      {/* Chart */}
      <div className="relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 rounded-xl z-10">
            <div className="flex flex-col items-center gap-2 text-slate-400">
              <span className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
              <span className="text-sm">Loading chart...</span>
            </div>
          </div>
        )}
        <div
          ref={chartContainerRef}
          className="w-full rounded-xl overflow-hidden"
          style={{ height: "380px" }}
        />
      </div>

      {/* Disclaimer */}
      <p className="text-slate-600 text-xs mt-3 text-center">
        Chart data is simulated for demonstration. Connect to Sepolia and deploy contracts to see live on-chain prices.
      </p>
    </div>
  );
}
