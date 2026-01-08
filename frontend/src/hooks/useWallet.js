/**
 * useWallet.js
 * React hook for MetaMask wallet connection, account tracking, and network switching.
 * Works with ethers.js v6.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";

const SEPOLIA_CHAIN_ID = "0xaa36a7"; // 11155111

export function useWallet() {
  const [address, setAddress]     = useState(null);
  const [chainId, setChainId]     = useState(null);
  const [balance, setBalance]     = useState(null);
  const [provider, setProvider]   = useState(null);
  const [signer, setSigner]       = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError]         = useState(null);
  const providerRef = useRef(null);

  // ── Internal: refresh balance ──────────────────────────────────
  const refreshBalance = useCallback(async (addr, prov) => {
    if (!addr || !prov) return;
    try {
      const bal = await prov.getBalance(addr);
      setBalance(bal);
    } catch {
      setBalance(null);
    }
  }, []);

  // ── Internal: set up provider/signer from window.ethereum ─────
  const setupProvider = useCallback(async () => {
    if (!window.ethereum) return null;
    const web3Provider = new ethers.BrowserProvider(window.ethereum);
    const web3Signer   = await web3Provider.getSigner();
    const network      = await web3Provider.getNetwork();
    providerRef.current = web3Provider;
    setProvider(web3Provider);
    setSigner(web3Signer);
    setChainId(network.chainId);
    return { web3Provider, web3Signer };
  }, []);

  // ── Connect wallet ─────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setError("MetaMask not found. Please install MetaMask to use HamzaDEX.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (!accounts?.length) throw new Error("No accounts returned");

      const { web3Provider } = await setupProvider();
      const addr = accounts[0];
      setAddress(addr);
      await refreshBalance(addr, web3Provider);
    } catch (err) {
      if (err.code === 4001) {
        setError("Connection rejected by user.");
      } else {
        setError(err.message || "Failed to connect wallet.");
      }
    } finally {
      setConnecting(false);
    }
  }, [setupProvider, refreshBalance]);

  // ── Disconnect ─────────────────────────────────────────────────
  const disconnect = useCallback(() => {
    setAddress(null);
    setBalance(null);
    setProvider(null);
    setSigner(null);
    setChainId(null);
    setError(null);
    providerRef.current = null;
  }, []);

  // ── Switch to Sepolia ──────────────────────────────────────────
  const switchToSepolia = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_CHAIN_ID }],
      });
    } catch (switchErr) {
      // Chain not added — add it
      if (switchErr.code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: SEPOLIA_CHAIN_ID,
              chainName: "Sepolia Testnet",
              nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
              rpcUrls: ["https://rpc.sepolia.org", "https://sepolia.infura.io/v3/"],
              blockExplorerUrls: ["https://sepolia.etherscan.io"],
            }],
          });
        } catch (addErr) {
          setError("Failed to add Sepolia network: " + addErr.message);
        }
      } else {
        setError("Failed to switch network: " + switchErr.message);
      }
    }
  }, []);

  // ── Auto-reconnect if already authorized ──────────────────────
  useEffect(() => {
    if (!window.ethereum) return;
    window.ethereum.request({ method: "eth_accounts" }).then(async (accounts) => {
      if (accounts?.length) {
        const { web3Provider } = await setupProvider();
        setAddress(accounts[0]);
        await refreshBalance(accounts[0], web3Provider);
      }
    }).catch(() => {});
  }, [setupProvider, refreshBalance]);

  // ── Listen for account changes ─────────────────────────────────
  useEffect(() => {
    if (!window.ethereum) return;

    const onAccountsChanged = async (accounts) => {
      if (!accounts?.length) {
        disconnect();
        return;
      }
      const addr = accounts[0];
      setAddress(addr);
      const prov = providerRef.current;
      if (prov) {
        // Refresh signer for new account
        try {
          const newSigner = await prov.getSigner();
          setSigner(newSigner);
        } catch {}
        await refreshBalance(addr, prov);
      }
    };

    const onChainChanged = async (chainIdHex) => {
      const newChainId = BigInt(chainIdHex);
      setChainId(newChainId);
      // Re-setup provider for new chain
      if (window.ethereum) {
        const { web3Provider } = await setupProvider();
        if (address) await refreshBalance(address, web3Provider);
      }
    };

    const onDisconnect = () => disconnect();

    window.ethereum.on("accountsChanged", onAccountsChanged);
    window.ethereum.on("chainChanged",    onChainChanged);
    window.ethereum.on("disconnect",      onDisconnect);

    return () => {
      window.ethereum.removeListener("accountsChanged", onAccountsChanged);
      window.ethereum.removeListener("chainChanged",    onChainChanged);
      window.ethereum.removeListener("disconnect",      onDisconnect);
    };
  }, [address, disconnect, setupProvider, refreshBalance]);

  // ── Periodic balance refresh (every 15s) ──────────────────────
  useEffect(() => {
    if (!address || !providerRef.current) return;
    const interval = setInterval(() => {
      refreshBalance(address, providerRef.current);
    }, 15000);
    return () => clearInterval(interval);
  }, [address, refreshBalance]);

  return {
    address,
    chainId,
    balance,
    provider,
    signer,
    connecting,
    error,
    isConnected: !!address,
    connect,
    disconnect,
    switchToSepolia,
    refreshBalance: () => refreshBalance(address, providerRef.current),
  };
}
