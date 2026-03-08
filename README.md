# ArcSwap

> Production-quality Decentralized Exchange (DEX) built on Ethereum.
> Constant-product AMM (Uniswap V2-style), LP tokens, multi-hop routing, and a React + ethers.js v6 frontend.

[![Solidity](https://img.shields.io/badge/Solidity-0.8.20-363636?logo=solidity)](https://soliditylang.org)
[![Hardhat](https://img.shields.io/badge/Hardhat-2.19-yellow)](https://hardhat.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev)
[![ethers.js](https://img.shields.io/badge/ethers.js-v6-3C3C3D)](https://docs.ethers.org/v6)
[![License: MIT](https://img.shields.io/badge/License-MIT-green)](LICENSE)

---

## Live Demo

> **Live demo not yet deployed.** Frontend runs locally — see [Local Development](#local-development) below.

---

## Architecture

```
                          +---------------------------+
                          |       ArcSwap Frontend   |
                          |   React + ethers.js v6    |
                          |   Tailwind CSS + Vite     |
                          +-------------+-------------+
                                        |
                              MetaMask / WalletConnect
                                        |
                          +-------------v-------------+
                          |       ArcSwap.sol       |  <-- Router
                          |  AMM Router + Factory     |
                          |  createPair / swap /      |
                          |  addLiquidity             |
                          +---+-------------------+---+
                              |                   |
              +---------------v--+   +------------v----------+
              | LiquidityPool.sol|   | LiquidityPool.sol     |
              | ARC / WETH     |   | ARC / USDC          |
              | ERC-20 LP Token  |   | ERC-20 LP Token       |
              | Reserves tracked |   | Reserves tracked      |
              +------------------+   +-----------------------+
                              |
              +---------------v--+
              | LiquidityPool.sol|
              | WETH  / USDC     |
              | ERC-20 LP Token  |
              +------------------+

              +------------------+   +------------------+
              |  ArcToken.sol  |   |  ArcToken.sol  |
              |  ARC (ERC-20)  |   |  WETH mock       |
              |  1M initial sup. |   |  USDC mock       |
              +------------------+   +------------------+
```

---

## Features

- **Constant-product AMM** — x * y = k formula, identical to Uniswap V2
- **0.3% swap fee** — Retained in pool, earned by liquidity providers
- **ERC-20 LP tokens** — Proportional to pool share, redeemable anytime
- **Multi-hop routing** — Swap A -> B -> C in a single transaction
- **Slippage protection** — amountOutMin / amountInMax on every swap
- **Deadline enforcement** — All state-changing calls expire after a timestamp
- **Reentrancy guard** — All critical functions use OpenZeppelin ReentrancyGuard
- **TWAP price oracle** — Cumulative price accumulators on every block
- **Permit support** — ERC-20 permit on ArcToken for gasless approvals
- **Etherscan verification** — Automated on Sepolia via Hardhat Verify
- **React frontend** — Swap UI, Liquidity panel, candlestick price chart
- **MetaMask integration** — Connect, network switch, account tracking
- **Live price impact** — Calculated on every input change

---

## Tech Stack

| Layer       | Technology                          |
|-------------|-------------------------------------|
| Contracts   | Solidity 0.8.20, OpenZeppelin v5    |
| Dev tooling | Hardhat 2.19, ethers.js v6          |
| Testing     | Hardhat + Chai + network helpers    |
| Coverage    | solidity-coverage                   |
| Frontend    | React 18, Vite 5, Tailwind CSS 3    |
| Web3        | ethers.js v6 (BrowserProvider)      |
| Charts      | lightweight-charts v4               |
| Deploy      | Hardhat deploy scripts + Etherscan  |

---

## Contract Addresses (Sepolia)

> **Not yet deployed to Sepolia.** Contracts run on a local Hardhat network during development.
>
> To deploy to Sepolia yourself, see [Sepolia Deployment](#sepolia-deployment) below.
> After deploying, update `frontend/src/utils/contracts.js` with your addresses.

---

## How It Works — AMM Math

### Constant Product Formula

Every pool maintains the invariant:

```
x * y = k
```

Where `x` = reserve of token A, `y` = reserve of token B, and `k` is a constant
that can only increase (never decrease) due to fees.

### Swap Output Calculation

Given an input amount, the output is:

```
amountOut = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)
```

The `997/1000` factor represents the **0.3% fee** retained in the pool
(i.e., only 99.7% of the input participates in the swap).

### Price Impact

```
spotPrice      = reserveOut / reserveIn          (no fee, instantaneous)
executionPrice = amountOut  / amountIn           (after fee)
priceImpact    = (spotPrice - executionPrice) / spotPrice * 100
```

Larger swaps relative to pool size cause higher price impact.

### LP Token Minting

**First deposit:**
```
LP = sqrt(amountA * amountB) - MINIMUM_LIQUIDITY
```
`MINIMUM_LIQUIDITY = 1000` wei is burned permanently to prevent division by zero.

**Subsequent deposits:**
```
LP = min(amountA / reserveA, amountB / reserveB) * totalSupply
```
This ensures you can't dilute existing LPs by depositing in an off-ratio way.

### LP Token Redemption

```
amountA = lpBurned / totalSupply * reserveA
amountB = lpBurned / totalSupply * reserveB
```

LPs receive their proportional share of **accumulated fees** as well, because
fees increase the reserves without increasing LP token supply.

### Multi-hop Routing

For a path `[A, B, C]`:
```
amountB = getAmountOut(amountA, reserveA_in_AB, reserveB_in_AB)
amountC = getAmountOut(amountB, reserveB_in_BC, reserveC_in_BC)
```

---

## Getting Started

### Prerequisites

- Node.js >= 18
- npm or yarn
- MetaMask browser extension (for frontend)
- Alchemy or Infura account (for Sepolia RPC)

### Installation

```bash
git clone https://github.com/Hamz04/hamza-dex.git
cd hamza-dex

# Install root dependencies (Hardhat, OpenZeppelin, etc.)
npm install

# Install frontend dependencies
cd frontend && npm install && cd ..
```

### Configure Environment

```bash
cp .env.example .env
# Edit .env and fill in your PRIVATE_KEY, SEPOLIA_RPC_URL, ETHERSCAN_API_KEY
```

### Compile Contracts

```bash
npm run compile
```

### Run Tests

```bash
# Full test suite with gas report
npm test

# With coverage report
npm run test:coverage

# Gas usage breakdown
npm run gas-report
```

Expected output:
```
  ArcSwap
    Pair Management
      ✓ should have created 3 pairs
      ✓ should return same pair address regardless of token order
      ...
    Swap Math — Constant Product
      ✓ getAmountOut should match formula
      ✓ k should be preserved after swap
    ...

  LiquidityPool
    LP Token Minting — First Deposit
      ✓ should mint sqrt(amountA * amountB) - MINIMUM_LIQUIDITY LP tokens
      ...

  82 passing
```

---

## Local Development

### Start a local Hardhat node

```bash
npm run node
```

### Deploy contracts to localhost

```bash
npm run deploy:local
```

Output:
```
  [1/6] Deploying ArcToken (ARC)...
    ✓ ArcToken (ARC) deployed at: 0x5FbDB2315678afecb367f032d93F642f64180aa3
  [2/6] Deploying mock WETH...
  ...
  Deployments saved to deployments/localhost.json
```

### Seed initial liquidity

```bash
npm run seed:local
```

### Start the frontend

```bash
cd frontend
npm run dev
# Open http://localhost:3000
```

The app will connect to your local Hardhat node at `http://127.0.0.1:8545`.
Import the Hardhat test account private key into MetaMask to interact with the DEX.

---

## Sepolia Deployment

### 1. Get Sepolia ETH

Visit [sepoliafaucet.com](https://sepoliafaucet.com) or [alchemy.com/faucets/ethereum-sepolia](https://www.alchemy.com/faucets/ethereum-sepolia).

### 2. Configure .env

```env
PRIVATE_KEY=your_wallet_private_key
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<your-alchemy-key>
ETHERSCAN_API_KEY=your_etherscan_api_key
```

### 3. Deploy

```bash
npm run deploy:sepolia
```

### 4. Seed liquidity

```bash
npm run seed:sepolia
```

### 5. Update frontend addresses

Edit `frontend/src/utils/contracts.js` and update the `ADDRESSES[11155111]` object
with your deployed addresses from `deployments/sepolia.json`.

### 6. Deploy frontend

```bash
cd frontend
npm run build
# Deploy dist/ to Vercel, Netlify, or GitHub Pages
```

---

## Project Structure

```
hamza-dex/
├── contracts/
│   ├── ArcToken.sol         ERC-20 with mint/burn/permit, 1M initial supply
│   ├── ArcSwap.sol          AMM router: swap, addLiquidity, removeLiquidity
│   ├── LiquidityPool.sol      ERC-20 LP token + constant product pool
│   └── interfaces/
│       ├── IArcSwap.sol     Router interface
│       └── ILiquidityPool.sol Pool interface
├── scripts/
│   ├── deploy.js              Full deployment + Etherscan verification
│   └── seed-liquidity.js      Add initial liquidity to all pairs
├── test/
│   ├── ArcSwap.test.js      47 tests: math, fees, slippage, deadline, multi-hop
│   └── LiquidityPool.test.js  LP minting, proportional withdrawal, reserves
├── frontend/
│   ├── src/
│   │   ├── App.jsx            Main app shell + toast notifications
│   │   ├── components/
│   │   │   ├── WalletConnect.jsx   MetaMask connect button + address display
│   │   │   ├── SwapInterface.jsx   Full swap UI with live quotes
│   │   │   ├── LiquidityPanel.jsx  Add/remove liquidity with position tracking
│   │   │   └── PriceChart.jsx      Candlestick chart (lightweight-charts)
│   │   ├── hooks/
│   │   │   ├── useWallet.js        Wallet connect, account + network tracking
│   │   │   ├── useSwap.js          Quote, approve, executeSwap
│   │   │   └── useLiquidity.js     addLiquidity, removeLiquidity, getPosition
│   │   └── utils/
│   │       ├── contracts.js        ABIs, addresses, contract factory helpers
│   │       └── calculations.js     AMM math, formatters, price impact
│   ├── package.json
│   ├── vite.config.js
│   └── index.html
├── deployments/               Auto-generated JSON files per network
├── hardhat.config.js
├── package.json
├── .env.example
└── README.md
```

---

## Security Considerations

- **Reentrancy**: All pool functions use `ReentrancyGuard` from OpenZeppelin v5.
- **Integer overflow**: Solidity 0.8.20 has built-in overflow checks. Unchecked blocks used only for intentional TWAP overflow (standard Uniswap V2 pattern).
- **Deadline**: Every state-changing router call requires a future deadline timestamp.
- **Slippage**: `amountOutMin` / `amountInMax` on all swap functions.
- **Access control**: `mint()`, `burn()`, `swap()` on LiquidityPool are restricted to the authorised router via `onlyRouter` modifier.
- **Canonical ordering**: Token pairs are always stored with the lower address first, preventing duplicate pairs.
- **MINIMUM_LIQUIDITY**: 1000 wei of LP tokens burned on first deposit to prevent dust attacks.
- **SafeERC20**: All token transfers use OpenZeppelin `SafeERC20` to handle non-standard ERC-20s.

> **This is testnet software. Do not use with real funds without a full professional audit.**

---

## Gas Usage (approximate)

| Function              | Gas      |
|-----------------------|----------|
| `createPair`          | ~2.1M    |
| `addLiquidity` (new)  | ~210K    |
| `addLiquidity` (exist)| ~130K    |
| `removeLiquidity`     | ~120K    |
| `swapExactTokens` (1-hop) | ~90K |
| `swapExactTokens` (2-hop) | ~150K|
| `ArcToken.mint`     | ~55K     |

---

## Screenshots

### Swap Interface
```
+------------------------------------------+
|  Swap                              [⚙]   |
|  +--------------------------------------+ |
|  | You Pay             Balance: 1,000   | |
|  | [  500.00                ] [ARC ▼] | |
|  +--------------------------------------+ |
|                   [⇅]                     |
|  +--------------------------------------+ |
|  | You Receive         Balance: 50.21   | |
|  | [  990.12                ] [WETH  ▼] | |
|  +--------------------------------------+ |
|  Rate:         1 ARC = 1.980 WETH       |
|  Price Impact: 0.12% (Very Low)           |
|  Min Received: 985.17 WETH (0.5% slippage)|
|  Fee:          0.3%                       |
|                                           |
|  [         Swap          ]                |
+------------------------------------------+
```

### Liquidity Panel
```
+------------------------------------------+
|  Liquidity          [Add] [Remove]        |
|                                           |
|  Your Position                            |
|  Pool Share:    49.5%                     |
|  LP Tokens:     141,421.35                |
|  ARC in pool: 100,000.00                |
|  WETH in pool:  50.00                     |
|  Est. APY:      12.4%                     |
|                                           |
|  Amount to Remove:  50%                   |
|  [25%] [50%] [75%] [100%]                 |
|                                           |
|  You will receive:                        |
|  ~50,000 ARC                            |
|  ~25 WETH                                 |
|                                           |
|  [  Remove 50% Liquidity  ]               |
+------------------------------------------+
```

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Write tests for new functionality
4. Ensure all tests pass: `npm test`
5. Submit a pull request

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

Built with care by **Hamzy**. Star the repo if you find it useful!
