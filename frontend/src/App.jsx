import React, { useState, useCallback } from "react";
import WalletConnect from "./components/WalletConnect.jsx";
import SwapInterface from "./components/SwapInterface.jsx";
import LiquidityPanel from "./components/LiquidityPanel.jsx";
import PriceChart from "./components/PriceChart.jsx";
import { useWallet } from "./hooks/useWallet.js";

// ─────────────────────────────────────────────────────────────────
// Tab definitions
// ─────────────────────────────────────────────────────────────────
const TABS = [
  { id: "swap",      label: "Swap",      icon: "⇄" },
  { id: "liquidity", label: "Liquidity", icon: "◈" },
  { id: "chart",     label: "Chart",     icon: "▲" },
];

// ─────────────────────────────────────────────────────────────────
// Stat Card
// ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub }) {
  return (
    <div className="card flex flex-col gap-1">
      <span className="text-xs text-slate-500 uppercase tracking-widest">{label}</span>
      <span className="text-xl font-bold text-slate-100">{value}</span>
      {sub && <span className="text-xs text-slate-500">{sub}</span>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Notification Toast
// ─────────────────────────────────────────────────────────────────
function Toast({ notifications, onDismiss }) {
  if (!notifications.length) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm animate-fade-in">
      {notifications.map((n) => (
        <div
          key={n.id}
          className={`flex items-start gap-3 p-4 rounded-xl border shadow-2xl backdrop-blur-sm cursor-pointer
            ${n.type === "success" ? "bg-emerald-900/90 border-emerald-700 text-emerald-100" :
              n.type === "error"   ? "bg-red-900/90 border-red-700 text-red-100" :
                                     "bg-slate-800/90 border-slate-700 text-slate-100"}`}
          onClick={() => onDismiss(n.id)}
        >
          <span className="text-xl flex-shrink-0">
            {n.type === "success" ? "✓" : n.type === "error" ? "✗" : "ℹ"}
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">{n.title}</p>
            {n.message && <p className="text-xs opacity-80 mt-0.5 break-words">{n.message}</p>}
            {n.txHash && (
              <a
                href={`https://sepolia.etherscan.io/tx/${n.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs underline opacity-70 hover:opacity-100 mt-1 block"
                onClick={(e) => e.stopPropagation()}
              >
                View on Etherscan ↗
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────────
export default function App() {
  const [activeTab, setActiveTab] = useState("swap");
  const [notifications, setNotifications] = useState([]);
  const wallet = useWallet();

  // ── Notification helpers ───────────────────────────────────────
  const notify = useCallback((type, title, message, txHash) => {
    const id = Date.now();
    setNotifications((prev) => [...prev, { id, type, title, message, txHash }]);
    // Auto-dismiss after 8s
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 8000);
  }, []);

  const dismissNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // ── Network badge ──────────────────────────────────────────────
  const networkLabel = wallet.chainId === 11155111n
    ? "Sepolia"
    : wallet.chainId === 1n
    ? "Mainnet"
    : wallet.chainId === 31337n
    ? "Localhost"
    : wallet.chainId
    ? `Chain ${wallet.chainId}`
    : null;

  const isCorrectNetwork = wallet.chainId === 11155111n || wallet.chainId === 31337n;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* ── Background gradient ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />
      </div>

      {/* ── Header ── */}
      <header className="relative z-10 border-b border-slate-800/60 backdrop-blur-sm bg-slate-950/80 sticky top-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-lg glow-indigo">
              H
            </div>
            <div>
              <span className="font-bold text-lg text-gradient">HamzaDEX</span>
              <span className="ml-2 text-[10px] text-slate-500 uppercase tracking-widest font-medium">v1.0</span>
            </div>
          </div>

          {/* Nav links (desktop) */}
          <nav className="hidden md:flex items-center gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150
                  ${activeTab === tab.id
                    ? "bg-indigo-600/20 text-indigo-400 border border-indigo-600/30"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                  }`}
              >
                <span className="mr-1.5">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Right: network + wallet */}
          <div className="flex items-center gap-3">
            {networkLabel && (
              <span className={`hidden sm:inline-flex badge text-xs ${isCorrectNetwork ? "badge-green" : "badge-red"}`}>
                {networkLabel}
              </span>
            )}
            <WalletConnect wallet={wallet} onNotify={notify} />
          </div>
        </div>
      </header>

      {/* ── Wrong Network Banner ── */}
      {wallet.address && !isCorrectNetwork && wallet.chainId && (
        <div className="relative z-10 bg-yellow-900/60 border-b border-yellow-700/50 px-4 py-3 text-center">
          <p className="text-yellow-300 text-sm font-medium">
            Please switch to Sepolia testnet to use HamzaDEX.{" "}
            <button
              onClick={wallet.switchToSepolia}
              className="underline hover:text-yellow-100 transition-colors font-semibold"
            >
              Switch Network
            </button>
          </p>
        </div>
      )}

      {/* ── Main Content ── */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-8">

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard label="Total Pairs"   value="3"          sub="HAMZA/WETH, HAMZA/USDC, WETH/USDC" />
          <StatCard label="Network"       value={networkLabel ?? "—"} sub={isCorrectNetwork ? "Connected" : "Wrong network"} />
          <StatCard label="Protocol Fee"  value="0.3%"       sub="Earned by LPs" />
          <StatCard label="AMM Formula"   value="x · y = k"  sub="Constant product" />
        </div>

        {/* Mobile tab bar */}
        <div className="flex md:hidden gap-2 mb-6 bg-slate-900 p-1.5 rounded-xl border border-slate-800">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all
                ${activeTab === tab.id ? "tab-btn-active" : "tab-btn-inactive"}`}
            >
              <span className="mr-1">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Panels */}
        <div className="animate-fade-in">
          {activeTab === "swap" && (
            <div className="flex flex-col lg:flex-row gap-6 items-start justify-center">
              <SwapInterface wallet={wallet} onNotify={notify} />
            </div>
          )}

          {activeTab === "liquidity" && (
            <div className="flex flex-col lg:flex-row gap-6 items-start justify-center">
              <LiquidityPanel wallet={wallet} onNotify={notify} />
            </div>
          )}

          {activeTab === "chart" && (
            <div className="flex flex-col gap-6">
              <PriceChart wallet={wallet} />
            </div>
          )}
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-slate-800/40 mt-16 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-[10px]">H</div>
            <span className="text-slate-500 text-sm">HamzaDEX — Built by Hamza Ahmad</span>
          </div>
          <div className="flex items-center gap-6 text-slate-500 text-sm">
            <a
              href="https://github.com/Hamz04/hamza-dex"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-300 transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://sepolia.etherscan.io"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-300 transition-colors"
            >
              Etherscan
            </a>
            <span className="text-slate-600">MIT License</span>
          </div>
        </div>
      </footer>

      {/* ── Toast Notifications ── */}
      <Toast notifications={notifications} onDismiss={dismissNotification} />
    </div>
  );
}
