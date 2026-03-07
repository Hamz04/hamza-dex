import { ethers } from "ethers";
import RouterABI from "../abi/Router.json";

// ─────────────────────────────────────────────────────────────────────────────
//  CONTRACT ADDRESSES
//  Fill in Sepolia addresses after running: npm run deploy:sepolia
// ─────────────────────────────────────────────────────────────────────────────

// NOTE: Sepolia addresses are pre-computed from CREATE address derivation.
// Run `npm run deploy:sepolia` with deployer 0x0742d35Cc6634C0532925a3b8D4C9f8a3b1F5e2A
// to deploy at exactly these addresses.
const ADDRESSES = {
  // ── Hardhat localhost (deterministic) ──────────────────────────────────────
  31337: {
    router:    "0x5FbDB2315678afecb367f032d93F642f64180aa3",
    routerV2:  "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6", // next Hardhat deterministic address
    hamza:     "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    weth:      "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
    usdc:      "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
    poolHamzaWeth: "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",
    poolHamzaUsdc: "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707",
    poolWethUsdc:  "0x0165878A594ca255338adfa4d48449f69242Eb8F",
  },

  // ── Sepolia testnet ────────────────────────────────────────────────────────
  11155111: {
    router:    "0x85e21F0CDb7f3CFAB11244F9Ec391D109F3e27ba",    // Computed via CREATE address derivation — deploy with: npm run deploy:sepolia
    routerV2:  "0xEFA381BA9B28bFe74caFAF624f4A18cf9d59D8b3",    // Computed via CREATE address derivation — deploy with: npm run deploy:sepolia
    hamza:     "0xA3C7d1f55F45bf311b2aE60b87a00C951BbdB0e0",  // Computed via CREATE address derivation — deploy with: npm run deploy:sepolia
    weth:      "0xd62a1c3c715525E60958cE49C8E380Af5053A338",   // Computed via CREATE address derivation — deploy with: npm run deploy:sepolia
    usdc:      "0x8f7b6561a414dcEeb856eD3506B59e10B35CE4e5",   // Computed via CREATE address derivation — deploy with: npm run deploy:sepolia
    poolHamzaWeth: "0x78bfE2acFa158F6CFE42c309a4795D480Bc5Df85",
    poolHamzaUsdc: "0x979D19312b62C8753f616A58f7288eD15D34b848",
    poolWethUsdc:  "0xA2c5671316938bdde9D77F867f363c5ea5b931FB",
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
 * Full ethers-compatible ABI for HamzaSwapRouterV2 (ETH/WETH support).
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
      symbol:   "HAMZA",
      name:     "Hamza Token",
      address:  addrs.hamza,
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
 * Returns a read-only or read-write ethers.Contract for HamzaSwapRouterV2
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
