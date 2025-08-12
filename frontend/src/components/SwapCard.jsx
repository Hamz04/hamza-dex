import { useState } from "react";
import { ethers } from "ethers";
import RouterABI from "../abi/Router.json";

export default function SwapCard({ signer, routerAddress }) {
  const [tokenIn, setTokenIn] = useState("");
  const [tokenOut, setTokenOut] = useState("");
  const [amountIn, setAmountIn] = useState("");
  const [amountOut, setAmountOut] = useState("");
  const [priceImpact, setPriceImpact] = useState(null);
  const [loading, setLoading] = useState(false);

  async function getQuote(val) {
    if (!val || !tokenIn || !tokenOut || !signer) return;
    try {
      const router = new ethers.Contract(routerAddress, RouterABI, signer);
      // simplified: fetch reserves and compute
      const amtIn = ethers.parseEther(val);
      // placeholder — real impl fetches pair reserves
      setAmountOut(ethers.formatEther(amtIn * 997n / 1000n));
      setPriceImpact("0.12");
    } catch (e) { console.error(e); }
  }

  async function executeSwap() {
    if (!signer) return alert("Connect wallet first");
    setLoading(true);
    try {
      const router = new ethers.Contract(routerAddress, RouterABI, signer);
      const deadline = Math.floor(Date.now() / 1000) + 1200;
      const tx = await router.swapExactTokensForTokens(
        ethers.parseEther(amountIn), 0,
        [tokenIn, tokenOut], await signer.getAddress(), deadline
      );
      await tx.wait();
      alert("Swap successful!");
    } catch (e) { alert(e.message); }
    setLoading(false);
  }

  return (
    <div className="bg-white/5 backdrop-blur rounded-2xl p-6 border border-white/10">
      <h2 className="text-lg font-semibold mb-4">Swap</h2>
      <div className="space-y-2">
        <div className="bg-white/5 rounded-xl p-4">
          <label className="text-xs text-gray-400">From</label>
          <input placeholder="Token address" value={tokenIn} onChange={e => setTokenIn(e.target.value)}
            className="w-full bg-transparent text-sm mt-1 outline-none" />
          <input type="number" placeholder="0.0" value={amountIn}
            onChange={e => { setAmountIn(e.target.value); getQuote(e.target.value); }}
            className="w-full bg-transparent text-2xl font-bold mt-1 outline-none" />
        </div>
        <div className="flex justify-center text-gray-400 text-xl">down</div>
        <div className="bg-white/5 rounded-xl p-4">
          <label className="text-xs text-gray-400">To</label>
          <input placeholder="Token address" value={tokenOut} onChange={e => setTokenOut(e.target.value)}
            className="w-full bg-transparent text-sm mt-1 outline-none" />
          <div className="text-2xl font-bold mt-1 text-gray-300">{amountOut || "0.0"}</div>
        </div>
        {priceImpact && (
          <div className="flex justify-between text-sm text-gray-400 px-1">
            <span>Price Impact</span>
            <span className={parseFloat(priceImpact) > 5 ? "text-red-400" : "text-green-400"}>
              {priceImpact}%
            </span>
          </div>
        )}
        <button onClick={executeSwap} disabled={loading || !signer}
          className="w-full py-4 bg-gradient-to-r from-pink-600 to-purple-600 rounded-xl font-semibold
            hover:opacity-90 disabled:opacity-50 transition-all">
          {loading ? "Swapping..." : !signer ? "Connect Wallet" : "Swap"}
        </button>
      </div>
    </div>
  );
}
