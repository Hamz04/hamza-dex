import { useState, useEffect } from "react";
import { ethers } from "ethers";
import SwapCard from "./components/SwapCard";
import LiquidityCard from "./components/LiquidityCard";
import PoolStats from "./components/PoolStats";
import ConnectWallet from "./components/ConnectWallet";
import "./App.css";

const ROUTER_ADDRESS = "0x..."; // deployed router
const FACTORY_ADDRESS = "0x..."; // deployed factory

export default function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState(null);
  const [activeTab, setActiveTab] = useState("swap");

  async function connectWallet() {
    if (!window.ethereum) return alert("Install MetaMask!");
    const _provider = new ethers.BrowserProvider(window.ethereum);
    await _provider.send("eth_requestAccounts", []);
    const _signer = await _provider.getSigner();
    setProvider(_provider);
    setSigner(_signer);
    setAccount(await _signer.getAddress());
  }

  useEffect(() => {
    if (window.ethereum?.selectedAddress) connectWallet();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-black text-white">
      <nav className="flex items-center justify-between px-8 py-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full" />
          <span className="text-xl font-bold">HamzaSwap</span>
          <span className="text-xs bg-purple-800 px-2 py-0.5 rounded-full">Sepolia</span>
        </div>
        <ConnectWallet account={account} onConnect={connectWallet} />
      </nav>

      <main className="max-w-lg mx-auto pt-16 px-4">
        <div className="flex gap-2 mb-6 bg-white/5 rounded-xl p-1">
          {["swap", "liquidity", "pool"].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize transition-all
                ${activeTab === tab ? "bg-purple-600 text-white" : "text-gray-400 hover:text-white"}`}>
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "swap" && <SwapCard signer={signer} routerAddress={ROUTER_ADDRESS} />}
        {activeTab === "liquidity" && <LiquidityCard signer={signer} routerAddress={ROUTER_ADDRESS} />}
        {activeTab === "pool" && <PoolStats provider={provider} factoryAddress={FACTORY_ADDRESS} />}
      </main>
    </div>
  );
}
