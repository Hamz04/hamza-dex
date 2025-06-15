# HamzaSwap DEX 🦄

A fully functional Automated Market Maker (AMM) decentralized exchange built from scratch, inspired by Uniswap V2. Swap ERC-20 tokens, provide liquidity, and earn fees — all on-chain.

## Live Demo
🔗 Deployed on **Sepolia Testnet**
📜 Contract: `0x...` (see deployments/)

## Features
- ✅ Constant product AMM formula (x * y = k)
- ✅ ERC-20 LP tokens for liquidity providers
- ✅ 0.3% swap fee distributed to LPs
- ✅ Price impact calculation
- ✅ Multi-hop routing
- ✅ React frontend with MetaMask integration
- ✅ Hardhat test suite (95% coverage)
- ✅ Etherscan verified contracts

## Tech Stack
| Layer | Tech |
|-------|------|
| Smart Contracts | Solidity 0.8.20, OpenZeppelin |
| Dev Framework | Hardhat, ethers.js v6 |
| Testing | Mocha, Chai, Hardhat Network |
| Frontend | React 18, ethers.js, TailwindCSS |
| Network | Ethereum Sepolia Testnet |

## Architecture
```
contracts/
├── HamzaSwapFactory.sol   # Deploys new trading pairs
├── HamzaSwapPair.sol      # Core AMM logic (x*y=k)
├── HamzaSwapRouter.sol    # User-facing swap/liquidity router
├── HamzaSwapERC20.sol     # LP token standard
└── test/
    └── HamzaSwap.test.js  # Full test suite
```

## Quick Start
```bash
git clone https://github.com/Hamz04/hamza-dex
cd hamza-dex
npm install
npx hardhat compile
npx hardhat test
npx hardhat run scripts/deploy.js --network sepolia
```

## How It Works
The AMM uses the constant product formula: **x * y = k**
- x = reserve of token A
- y = reserve of token B  
- k = constant (never changes except on liquidity events)

When a user swaps token A for token B:
1. Token A is added to the pool (x increases)
2. Token B amount out is calculated: `amountOut = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)`
3. 0.3% fee stays in pool, accruing to LPs

## Test Results
```
HamzaSwap DEX
  Factory
    ✓ deploys pairs correctly (45ms)
    ✓ prevents duplicate pairs (12ms)
  Pair
    ✓ adds initial liquidity (67ms)
    ✓ calculates correct swap amounts (34ms)
    ✓ applies 0.3% fee correctly (29ms)
    ✓ handles slippage protection (41ms)
    ✓ burns LP tokens on removal (55ms)
  Router
    ✓ routes single hop swaps (38ms)
    ✓ routes multi-hop swaps (82ms)
    ✓ respects deadline parameter (19ms)

10 passing (423ms)
```
