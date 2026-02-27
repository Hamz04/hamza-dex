import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';
import { ethers } from 'ethers';
import { getPoolContract } from '../utils/contracts';

/**
 * PriceChart.jsx
 * Production-quality candlestick + volume chart for HamzaDEX pool price history.
 * Queries on-chain Swap events, groups them into OHLCV candles, and renders
 * via lightweight-charts.
 */

const TIMEFRAMES = {
  '1H': 3600,
  '4H': 14400,
  '1D': 86400,
};

const CHART_COLORS = {
  background: '#0f1117',
  text: '#d1d4dc',
  grid: '#1e2130',
  upColor: '#26a69a',
  downColor: '#ef5350',
  volumeUp: 'rgba(38,166,154,0.4)',
  volumeDown: 'rgba(239,83,80,0.4)',
  crosshair: '#758696',
};

/**
 * Group raw price points into OHLCV candles for the given interval (seconds).
 */
function groupIntoCandles(pricePoints, intervalSecs) {
  if (!pricePoints.length) return { candles: [], volumes: [] };

  const buckets = {};
  for (const { timestamp, price, amountIn } of pricePoints) {
    const bucket = Math.floor(timestamp / intervalSecs) * intervalSecs;
    if (!buckets[bucket]) {
      buckets[bucket] = { open: price, high: price, low: price, close: price, volume: 0 };
    }
    const b = buckets[bucket];
    b.high = Math.max(b.high, price);
    b.low = Math.min(b.low, price);
    b.close = price;
    b.volume += amountIn;
  }

  const sorted = Object.entries(buckets)
    .map(([time, ohlcv]) => ({ time: parseInt(time, 10), ...ohlcv }))
    .sort((a, b) => a.time - b.time);

  const candles = sorted.map(({ time, open, high, low, close }) => ({ time, open, high, low, close }));
  const volumes = sorted.map(({ time, open, close, volume }) => ({
    time,
    value: volume,
    color: close >= open ? CHART_COLORS.volumeUp : CHART_COLORS.volumeDown,
  }));

  return { candles, volumes };
}

export default function PriceChart({
  poolAddress,
  provider,
  tokenASymbol = 'TOKEN_A',
  tokenBSymbol = 'TOKEN_B',
}) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);

  const [timeframe, setTimeframe] = useState('1H');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [emptyReason, setEmptyReason] = useState(null);
  const [pricePoints, setPricePoints] = useState([]);
  const [lastPrice, setLastPrice] = useState(null);

  // Chart initialisation
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 320,
      layout: { background: { color: CHART_COLORS.background }, textColor: CHART_COLORS.text },
      grid: {
        vertLines: { color: CHART_COLORS.grid },
        horzLines: { color: CHART_COLORS.grid },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: CHART_COLORS.grid },
      timeScale: { borderColor: CHART_COLORS.grid, timeVisible: true, secondsVisible: false },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: CHART_COLORS.upColor,
      downColor: CHART_COLORS.downColor,
      borderUpColor: CHART_COLORS.upColor,
      borderDownColor: CHART_COLORS.downColor,
      wickUpColor: CHART_COLORS.upColor,
      wickDownColor: CHART_COLORS.downColor,
    });

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  // Fetch swap events
  const fetchPriceHistory = useCallback(async () => {
    if (!poolAddress || !provider) {
      setEmptyReason('Connect wallet and select a pool to view price history');
      setPricePoints([]);
      return;
    }

    setLoading(true);
    setError(null);
    setEmptyReason(null);

    try {
      const poolContract = getPoolContract(poolAddress, provider);

      const swapFilter = poolContract.filters.Swap();
      const currentBlock = await provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 2000);

      const logs = await provider.getLogs({
        ...swapFilter,
        fromBlock,
        toBlock: 'latest',
      });

      if (!logs.length) {
        setEmptyReason('No swaps yet — execute trades to populate price history');
        setPricePoints([]);
        setLoading(false);
        return;
      }

      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      const points = [];

      for (const log of logs) {
        try {
          const [amountIn, amountOut] = abiCoder.decode(['uint256', 'uint256', 'address'], log.data);
          const block = await provider.getBlock(log.blockNumber);
          if (!block) continue;

          const amtIn = parseFloat(ethers.formatUnits(amountIn, 18));
          const amtOut = parseFloat(ethers.formatUnits(amountOut, 18));
          if (amtIn === 0) continue;

          const price = amtOut / amtIn;
          points.push({ timestamp: block.timestamp, price, amountIn: amtIn });
        } catch {
          // skip malformed logs
        }
      }

      if (!points.length) {
        setEmptyReason('No swaps yet — execute trades to populate price history');
        setPricePoints([]);
      } else {
        points.sort((a, b) => a.timestamp - b.timestamp);
        setPricePoints(points);
        setLastPrice(points[points.length - 1].price);
      }
    } catch (err) {
      setError(err.message ?? 'Failed to load price history');
    } finally {
      setLoading(false);
    }
  }, [poolAddress, provider]);

  useEffect(() => {
    fetchPriceHistory();
  }, [fetchPriceHistory]);

  // Re-render candles on timeframe or data change
  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;
    if (!pricePoints.length) {
      candleSeriesRef.current.setData([]);
      volumeSeriesRef.current.setData([]);
      return;
    }
    const intervalSecs = TIMEFRAMES[timeframe];
    const { candles, volumes } = groupIntoCandles(pricePoints, intervalSecs);
    candleSeriesRef.current.setData(candles);
    volumeSeriesRef.current.setData(volumes);
    if (chartRef.current) chartRef.current.timeScale().fitContent();
  }, [pricePoints, timeframe]);

  const showEmpty = !loading && (emptyReason || error);

  return (
    <div style={{ background: CHART_COLORS.background, borderRadius: 12, padding: 16, color: CHART_COLORS.text }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 16 }}>
            {tokenASymbol} / {tokenBSymbol}
          </span>
          {lastPrice !== null && (
            <span style={{ marginLeft: 12, fontSize: 14, color: CHART_COLORS.upColor }}>
              {lastPrice.toFixed(6)}
            </span>
          )}
        </div>

        {/* Timeframe buttons */}
        <div style={{ display: 'flex', gap: 6 }}>
          {Object.keys(TIMEFRAMES).map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                background: timeframe === tf ? '#3a3f5c' : '#1e2130',
                color: timeframe === tf ? '#fff' : CHART_COLORS.text,
                transition: 'background 0.15s',
              }}
            >
              {tf}
            </button>
          ))}
          <button
            onClick={fetchPriceHistory}
            disabled={loading}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: 12,
              background: '#1e2130',
              color: CHART_COLORS.text,
            }}
          >
            {loading ? '...' : '\u21bb'}
          </button>
        </div>
      </div>

      {/* Chart canvas */}
      <div ref={chartContainerRef} style={{ width: '100%', display: showEmpty ? 'none' : 'block' }} />

      {/* Empty / error state overlay */}
      {showEmpty && (
        <div
          style={{
            height: 320,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#758696',
            fontSize: 14,
            textAlign: 'center',
            padding: '0 24px',
          }}
        >
          {error ? `Error: ${error}` : emptyReason}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: 12, color: '#758696', fontSize: 13 }}>
          Loading price history...
        </div>
      )}
    </div>
  );
}
