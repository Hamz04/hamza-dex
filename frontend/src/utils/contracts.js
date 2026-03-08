import { ethers } from "ethers";
import RouterABI from "../abi/Router.json";

// ─────────────────────────────────────────────────────────────────────────────
//  CONTRACT ADDRESSES
//  Fill in Sepolia addresses after running: npm run deploy:sepolia
// ─────────────────────────────────────────────────────────────────────────────

// NOTE: Sepolia addresses are empty until you deploy.
// Run `npm run deploy:sepolia` then copy addresses from deployments/sepolia.json.
const ADDRESSES = {
  // ── Hardhat localhost (deterministic) ──────────────────────────────────────
  31337: {
    router:    "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    routerV2:  "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6", // next Hardhat deterministic address
    arc:     "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    weth:      "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
    usdc:      "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
    poolArcWeth: "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",
    poolArcUsdc: "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707",
    poolWethUsdc:  "0x0165878A594ca255338adfa4d48449f69242Eb8F",
  },

  // ── Sepolia testnet ────────────────────────────────────────────────────────
  // Not yet deployed. Run `npm run deploy:sepolia` then paste addresses from
  // deployments/sepolia.json here.
  11155111: {
    router:      "",
    routerV2:    "",
    arc:         "",
    weth:        "",
    usdc:        "",
    poolArcWeth: "",
    poolArcUsdc: "",
    poolWethUsdc: "",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
//  ABIs
// ─────────────────────────────────────────────────────────────────────────────

export const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
];

export const LIQUIDITY_POOL_ABI = [
  // State
  "function tokenA() view returns (address)",
  "function tokenB() view returns (address)",
  "function getReserves() view returns (uint256 reserveA, uint256 reserveB)",
  "function getSpotPrice() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",

  // LP token
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 value) returns (bool)",
  "function transferFrom(address from, address to, uint256 value) returns (bool)",

  // Core AMM
  "function mint(address to) returns (uint256 liquidity)",
  "function burn(address to) returns (uint256 amountA, uint256 amountB)",
  "function swap(uint256 amountOut, address tokenOut, address to)",

  // TWAP oracle
  "function price0CumulativeLast() view returns (uint256)",
  "function price1CumulativeLast() view returns (uint256)",
  "function blockTimestampLast() view returns (uint32)",

  // Events
  "event Swap(address indexed sender, uint256 amountIn, uint256 amountOut, address indexed to)",
  "event Mint(address indexed sender, uint256 amountA, uint256 amountB)",
  "event Burn(address indexed sender, uint256 amountA, uint256 amountB, address indexed to)",
  "event Sync(uint256 reserveA, uint256 reserveB)",
];

export const ROUTER_ABI = [
  "function getPair(address tokenA, address tokenB) view returns (address)",
  "function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline) returns (uint256[] amounts)",
  "function swapTokensForExactTokens(uint256 amountOut, uint256 amountInMax, address[] path, address to, uint256 deadline) returns (uint256[] amounts)",
  "function addLiquidity(address tokenA, address tokenB, uint256 amountADesired, uint256 amountBDesired, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity)",
  "function removeLiquidity(address tokenA, address tokenB, uint256 liquidity, uint256 amountAMin, uint256 amountBMin, address to, uint256 deadline) returns (uint256 amountA, uint256 amountB)",
  "function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)",
  "function getAmountsIn(uint256 amountOut, address[] path) view returns (uint256[] amounts)",
  "function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) pure returns (uint256)",
];

/**
 * Full ethers-compatible ABI for ArcSwapRouterV2 (ETH/WETH support).
 * Imported from the generated Router.json artifact.
 */
export const ROUTER_V2_ABI = RouterABI;

// ─────────────────────────────────────────────────────────────────────────────
//  TOKEN LIST
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the canonical token list for a given chainId (bigint or number).
 */
export function getTokenList(chainId) {
  const id = Number(chainId);
  const addrs = ADDRESSES[id] ?? ADDRESSES[11155111];

  return [
    {
      symbol:   "ARC",
      name:     "Arc Token",
      address:  addrs.arc,
      decimals: 18,
      color:    "#6366f1",
      logoURI:  null,
    },
    {
      symbol:   "WETH",
      name:     "Wrapped Ether",
      address:  addrs.weth,
      decimals: 18,
      color:    "#627eea",
      logoURI:  null,
    },
    {
      symbol:   "USDC",
      name:     "USD Coin (Mock)",
      address:  addrs.usdc,
      decimals: 6,
      color:    "#2775ca",
      logoURI:  null,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
//  ADDRESS HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the full addresses object for a given chainId.
 */
export function getAddresses(chainId) {
  const id = Number(chainId);
  return ADDRESSES[id] ?? ADDRESSES[11155111];
}

// ─────────────────────────────────────────────────────────────────────────────
//  CONTRACT FACTORIES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a read-only or read-write ethers.Contract for the V1 router.
 * @param {ethers.Provider | ethers.Signer} providerOrSigner
 * @param {bigint | number} chainId
 */
export function getRouterContract(providerOrSigner, chainId) {
  const addrs = getAddresses(chainId);
  return new ethers.Contract(addrs.router, ROUTER_ABI, providerOrSigner);
}

/**
 * Returns a read-only or read-write ethers.Contract for ArcSwapRouterV2
 * (the ETH/WETH-enabled router).
 * @param {ethers.Provider | ethers.Signer} providerOrSigner
 * @param {bigint | number} chainId
 */
export function getRouterV2Contract(providerOrSigner, chainId) {
  const addrs = getAddresses(chainId);
  return new ethers.Contract(addrs.routerV2, ROUTER_V2_ABI, providerOrSigner);
}

/**
 * Returns a read-only or read-write ethers.Contract for a LiquidityPool.
 * @param {string} poolAddress
 * @param {ethers.Provider | ethers.Signer} providerOrSigner
 */
export function getPoolContract(poolAddress, providerOrSigner) {
  return new ethers.Contract(poolAddress, LIQUIDITY_POOL_ABI, providerOrSigner);
}

/**
 * Returns a read-only or read-write ERC-20 contract for any token.
 * @param {string} tokenAddress
 * @param {ethers.Provider | ethers.Signer} providerOrSigner
 */
export function getTokenContract(tokenAddress, providerOrSigner) {
  return new ethers.Contract(tokenAddress, ERC20_ABI, providerOrSigner);
}

// ─────────────────────────────────────────────────────────────────────────────
//  ETHERSCAN LINKS
// ─────────────────────────────────────────────────────────────────────────────

const EXPLORERS = {
  1:        "https://etherscan.io",
  11155111: "https://sepolia.etherscan.io",
  31337:    null, // localhost — no explorer
};

/**
 * Returns an Etherscan transaction link, or "#" for localhost.
 */
export function getEtherscanTxLink(txHash, chainId) {
  const base = EXPLORERS[Number(chainId)];
  return base ? `${base}/tx/${txHash}` : "#";
}

/**
 * Returns an Etherscan address link, or "#" for localhost.
 */
export function getEtherscanAddressLink(address, chainId) {
  const base = EXPLORERS[Number(chainId)];
  return base ? `${base}/address/${address}` : "#";
}
