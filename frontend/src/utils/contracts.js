/**
 * contracts.js
 * Contract ABIs, deployed addresses, and helper functions for ethers.js v6.
 */

import { ethers } from "ethers";

// ─────────────────────────────────────────────────────────────────
// Deployed Addresses by Network
// ─────────────────────────────────────────────────────────────────

export const ADDRESSES = {
  // Sepolia Testnet (chain ID: 11155111)
  11155111: {
    HamzaSwap:    "0x0000000000000000000000000000000000000000", // Replace after deploy
    HamzaToken:   "0x0000000000000000000000000000000000000000",
    WETHToken:    "0x0000000000000000000000000000000000000000",
    USDCToken:    "0x0000000000000000000000000000000000000000",
    HAMZAWETHPair:"0x0000000000000000000000000000000000000000",
    HAMZAUSDCPair:"0x0000000000000000000000000000000000000000",
    WETHUSDCPair: "0x0000000000000000000000000000000000000000",
  },
  // Hardhat / Localhost (chain ID: 31337)
  31337: {
    HamzaSwap:    "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
    HamzaToken:   "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    WETHToken:    "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    USDCToken:    "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
    HAMZAWETHPair:"0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",
    HAMZAUSDCPair:"0x5FC8d32690cc91D4c39d9d3abcBD16989F875707",
    WETHUSDCPair: "0x0165878A594ca255338adfa4d48449f69242Eb8F",
  },
};

// ─────────────────────────────────────────────────────────────────
// Token Metadata
// ─────────────────────────────────────────────────────────────────

export const TOKEN_LIST = {
  11155111: [
    { symbol: "HAMZA", name: "HamzaToken",   decimals: 18, addressKey: "HamzaToken",  color: "#6366f1" },
    { symbol: "WETH",  name: "Wrapped Ether", decimals: 18, addressKey: "WETHToken",   color: "#627eea" },
    { symbol: "USDC",  name: "USD Coin",      decimals: 18, addressKey: "USDCToken",   color: "#2775ca" },
  ],
  31337: [
    { symbol: "HAMZA", name: "HamzaToken",   decimals: 18, addressKey: "HamzaToken",  color: "#6366f1" },
    { symbol: "WETH",  name: "Wrapped Ether", decimals: 18, addressKey: "WETHToken",   color: "#627eea" },
    { symbol: "USDC",  name: "USD Coin",      decimals: 18, addressKey: "USDCToken",   color: "#2775ca" },
  ],
};

// ─────────────────────────────────────────────────────────────────
// ABIs
// ─────────────────────────────────────────────────────────────────

export const HAMZA_SWAP_ABI = [
  // View functions
  "function getPair(address tokenA, address tokenB) view returns (address pair)",
  "function allPairs(uint256 i) view returns (address pair)",
  "function allPairsLength() view returns (uint256)",
  "function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) pure returns (uint256 amountOut)",
  "function getAmountIn(uint256 amountOut, uint256 reserveIn, uint256 reserveOut) pure returns (uint256 amountIn)",
  "function getAmountsOut(uint256 amountIn, address[] calldata path) view returns (uint256[] memory amounts)",
  "function getAmountsIn(uint256 amountOut, address[] calldata path) view returns (uint256[] memory amounts)",
  "function getPrice(address tokenA, address tokenB) view returns (uint256 price)",
  "function feeTo() view returns (address)",
  // State-changing
  "function createPair(address tokenA, address tokenB) returns (address pair)",
  "function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity)",
  "function removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) returns (uint256 amountA, uint256 amountB)",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] calldata path, address to, uint256 deadline) returns (uint256[] memory amounts)",
  "function swapTokensForExactTokens(uint256 amountOut, uint256 amountInMax, address[] calldata path, address to, uint256 deadline) returns (uint256[] memory amounts)",
  // Events
  "event PairCreated(address indexed token0, address indexed token1, address pair, uint256 pairIndex)",
  "event Swap(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, address to)",
  "event LiquidityAdded(address indexed provider, address indexed tokenA, address indexed tokenB, uint256 amountA, uint256 amountB, uint256 liquidity)",
  "event LiquidityRemoved(address indexed provider, address indexed tokenA, address indexed tokenB, uint256 amountA, uint256 amountB, uint256 liquidity)",
];

export const LIQUIDITY_POOL_ABI = [
  // ERC-20
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  // Pool specific
  "function tokenA() view returns (address)",
  "function tokenB() view returns (address)",
  "function MINIMUM_LIQUIDITY() pure returns (uint256)",
  "function FEE_NUMERATOR() pure returns (uint256)",
  "function FEE_DENOMINATOR() pure returns (uint256)",
  "function kLast() view returns (uint256)",
  "function price0CumulativeLast() view returns (uint256)",
  "function price1CumulativeLast() view returns (uint256)",
  "function totalFeesEarnedA() view returns (uint256)",
  "function totalFeesEarnedB() view returns (uint256)",
  "function router() view returns (address)",
  "function getReserves() view returns (uint112 reserveA_, uint112 reserveB_, uint32 blockTimestampLast_)",
  "function getSpotPrice() view returns (uint256 price)",
  "function getShareBasisPoints(address holder) view returns (uint256 bps)",
  "function getUnderlyingTokens(uint256 lpAmount) view returns (uint256 underlyingA, uint256 underlyingB)",
  "function sync() external",
  // Events
  "event LiquidityAdded(address indexed provider, uint256 amountA, uint256 amountB, uint256 liquidity)",
  "event LiquidityRemoved(address indexed provider, uint256 amountA, uint256 amountB, uint256 liquidity)",
  "event Swapped(address indexed sender, uint256 amountAIn, uint256 amountBIn, uint256 amountAOut, uint256 amountBOut)",
  "event Sync(uint112 reserveA, uint112 reserveB)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
];

export const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
];

// ─────────────────────────────────────────────────────────────────
// Contract Factory Helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Get a contract instance by name using a signer or provider.
 *
 * @param {string}                   name      - Contract name key (e.g. "HamzaSwap")
 * @param {ethers.Signer|ethers.Provider} signer - Ethers signer or provider
 * @param {number|bigint}            chainId   - Network chain ID
 * @returns {ethers.Contract}
 */
export function getContract(name, signer, chainId) {
  const numChainId = Number(chainId);
  const addresses = ADDRESSES[numChainId];
  if (!addresses) throw new Error(`No deployment found for chain ID ${chainId}`);

  const address = addresses[name];
  if (!address || address === ethers.ZeroAddress) {
    throw new Error(`Contract "${name}" not deployed on chain ${chainId}`);
  }

  let abi;
  switch (name) {
    case "HamzaSwap":
      abi = HAMZA_SWAP_ABI;
      break;
    case "HamzaToken":
    case "WETHToken":
    case "USDCToken":
      abi = ERC20_ABI;
      break;
    case "HAMZAWETHPair":
    case "HAMZAUSDCPair":
    case "WETHUSDCPair":
      abi = LIQUIDITY_POOL_ABI;
      break;
    default:
      abi = ERC20_ABI;
  }

  return new ethers.Contract(address, abi, signer);
}

/**
 * Get a LiquidityPool contract by its address.
 *
 * @param {string}                   address - Pool contract address
 * @param {ethers.Signer|ethers.Provider} signer
 * @returns {ethers.Contract}
 */
export function getPoolContract(address, signer) {
  return new ethers.Contract(address, LIQUIDITY_POOL_ABI, signer);
}

/**
 * Get an ERC-20 token contract by address.
 *
 * @param {string}                   address - Token contract address
 * @param {ethers.Signer|ethers.Provider} signer
 * @returns {ethers.Contract}
 */
export function getTokenContract(address, signer) {
  return new ethers.Contract(address, ERC20_ABI, signer);
}

/**
 * Get the HamzaSwap router contract.
 *
 * @param {ethers.Signer|ethers.Provider} signer
 * @param {number|bigint}            chainId
 * @returns {ethers.Contract}
 */
export function getRouterContract(signer, chainId) {
  return getContract("HamzaSwap", signer, chainId);
}

// ─────────────────────────────────────────────────────────────────
// Address Helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Get all deployed addresses for a chain.
 * @param {number|bigint} chainId
 * @returns {object|null}
 */
export function getAddresses(chainId) {
  return ADDRESSES[Number(chainId)] ?? null;
}

/**
 * Get token list for a chain.
 * @param {number|bigint} chainId
 * @returns {Array}
 */
export function getTokenList(chainId) {
  const list = TOKEN_LIST[Number(chainId)] ?? [];
  const addresses = getAddresses(chainId);
  if (!addresses) return list;

  return list.map((token) => ({
    ...token,
    address: addresses[token.addressKey] ?? ethers.ZeroAddress,
  }));
}

/**
 * Get a specific token's address.
 * @param {string} symbol  - Token symbol ("HAMZA", "WETH", "USDC")
 * @param {number|bigint} chainId
 * @returns {string|null} Address or null
 */
export function getTokenAddress(symbol, chainId) {
  const list = getTokenList(chainId);
  return list.find((t) => t.symbol === symbol)?.address ?? null;
}

// ─────────────────────────────────────────────────────────────────
// Transaction Helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Get Etherscan link for a transaction.
 * @param {string} txHash
 * @param {number|bigint} chainId
 * @returns {string}
 */
export function getEtherscanTxLink(txHash, chainId) {
  const base = Number(chainId) === 11155111
    ? "https://sepolia.etherscan.io"
    : Number(chainId) === 1
    ? "https://etherscan.io"
    : "https://sepolia.etherscan.io";
  return `${base}/tx/${txHash}`;
}

/**
 * Get Etherscan link for an address.
 * @param {string} address
 * @param {number|bigint} chainId
 * @returns {string}
 */
export function getEtherscanAddressLink(address, chainId) {
  const base = Number(chainId) === 11155111
    ? "https://sepolia.etherscan.io"
    : "https://etherscan.io";
  return `${base}/address/${address}`;
}

/**
 * Standard deadline: current timestamp + minutes.
 * @param {number} minutes - Default 20
 * @returns {number}
 */
export function getDeadline(minutes = 20) {
  return Math.floor(Date.now() / 1000) + minutes * 60;
}

/**
 * Check and get ERC-20 approval, requesting it if insufficient.
 *
 * @param {ethers.Contract} tokenContract
 * @param {string}           owner    - Token owner address
 * @param {string}           spender  - Spender address (router)
 * @param {bigint}           amount   - Required amount
 * @returns {Promise<ethers.TransactionReceipt|null>} Receipt if approval was needed
 */
export async function ensureApproval(tokenContract, owner, spender, amount) {
  const allowance = await tokenContract.allowance(owner, spender);
  if (allowance >= amount) return null;

  // Approve max uint256 to save gas on future transactions
  const tx = await tokenContract.approve(spender, ethers.MaxUint256);
  return await tx.wait();
}
