import React from "react";
import { formatTokenAmount, shortenAddress } from "../utils/calculations.js";
import { getEtherscanAddressLink } from "../utils/contracts.js";

/**
 * WalletConnect.jsx
 * MetaMask connection button with address display, ETH balance, and network switching.
 */

function ConnectButton({ onClick, connecting }) {
  return (
    <button
      onClick={onClick}
      disabled={connecting}
      className="btn-primary text-sm py-2 px-4 flex items-center gap-2"
    >
      {connecting ? (
        <>
          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          Connecting...
        </>
      ) : (
        <>
          <span>🦊</span>
          Connect Wallet
        </>
      )}
    </button>
  );
}

function WalletInfo({ wallet }) {
  const { address, balance, chainId } = wallet;
  const ethBalance = balance ? formatTokenAmount(balance, 18, 4) : "0";

  const networkName =
    chainId === 11155111n ? "Sepolia" :
    chainId === 1n        ? "Mainnet" :
    chainId === 31337n    ? "Local"   :
    chainId               ? `#${chainId}` : "—";

  const isCorrectNetwork = chainId === 11155111n || chainId === 31337n;
  const etherscanUrl = address ? getEtherscanAddressLink(address, chainId ?? 11155111n) : null;

  return (
    <div className="flex items-center gap-2">
      {/* Balance */}
      <div className="hidden sm:flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2">
        <span className="text-slate-400 text-xs">ETH</span>
        <span className="text-slate-100 text-sm font-medium tabular-nums">{ethBalance}</span>
      </div>

      {/* Address + network */}
      <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2">
        {/* Network dot */}
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 ${
            isCorrectNetwork ? "bg-emerald-400" : "bg-red-400"
          }`}
          title={networkName}
        />

        {/* Address */}
        {etherscanUrl ? (
          <a
            href={etherscanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-mono text-slate-100 hover:text-indigo-400 transition-colors"
            title={address}
          >
            {shortenAddress(address)}
          </a>
        ) : (
          <span className="text-sm font-mono text-slate-100">
            {shortenAddress(address)}
          </span>
        )}

        {/* Disconnect button */}
        <button
          onClick={wallet.disconnect}
          className="text-slate-500 hover:text-red-400 transition-colors text-xs ml-1"
          title="Disconnect wallet"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default function WalletConnect({ wallet, onNotify }) {
  const handleConnect = async () => {
    await wallet.connect();
    if (wallet.error) {
      onNotify?.("error", "Connection Failed", wallet.error);
    } else if (wallet.address) {
      onNotify?.("success", "Wallet Connected", `Connected to ${shortenAddress(wallet.address)}`);
    }
  };

  if (wallet.isConnected) {
    return <WalletInfo wallet={wallet} />;
  }

  return (
    <ConnectButton
      onClick={handleConnect}
      connecting={wallet.connecting}
    />
  );
}
