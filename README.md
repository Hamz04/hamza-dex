# Flux Protocol

> Production-grade decentralized exchange protocol -- AMM liquidity pools, permissionless token listing, multi-hop swap routing, and automated market making. Live on Ethereum Sepolia.

[![Solidity](https://img.shields.io/badge/Solidity-0.8.20-blue)](https://soliditylang.org/)
[![Foundry](https://img.shields.io/badge/Built%20with-Foundry-orange)](https://getfoundry.sh/)
[![Tests](https://img.shields.io/badge/Tests-96%20passing-brightgreen)]()
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Network](https://img.shields.io/badge/Network-Sepolia-purple)](https://sepolia.etherscan.io/)

---

## Live Deployment (Sepolia Testnet)

| Contract | Address | Etherscan |
|----------|---------|----------|
| **FluxFactory** | `0x287a3a66474a98A2B5BaAeBDDb3AdBFA78629017` | [View](https://sepolia.etherscan.io/address/0x287a3a66474a98A2B5BaAeBDDb3AdBFA78629017) |
| **FluxSwapRouter** | `0x65450C8ED5ecC476eaf83D56EcbFC812182E9bdF` | [View](https://sepolia.etherscan.io/address/0x65450C8ED5ecC476eaf83D56EcbFC812182E9bdF) |
| **FLUX/ARC Pool** | `0x9Ef2e813Fb4F91626bde42B0560335911F6CD92e` | [View](https://sepolia.etherscan.io/address/0x9Ef2e813Fb4F91626bde42B0560335911F6CD92e) |
| **WETH9** | `0x59B5Ea637220288e212A65FCb0e781963924Ac32` | [View](https://sepolia.etherscan.io/address/0x59B5Ea637220288e212A65FCb0e781963924Ac32) |
| **FluxCoin (FLUX)** | `0x0b45216ce0a5DF6E4F7809cDFB693B1a41415720` | [View](https://sepolia.etherscan.io/address/0x0b45216ce0a5DF6E4F7809cDFB693B1a41415720) |
| **ArcToken (ARC)** | `0xB8Ea56ec6FfbDCeE9036F5fC11fc99436078A19A` | [View](https://sepolia.etherscan.io/address/0xB8Ea56ec6FfbDCeE9036F5fC11fc99436078A19A) |

> Initial liquidity seeded: 10,000 FLUX + 20,000 ARC (~14,142 LP tokens minted)

---

## Architecture

```
User / Frontend
       |
       v
+------------------+
|  FluxSwapRouter  |  -- Multi-hop routing, ETH wrapping, slippage protection
+------------------+
       |
       v
+------------------+     +------------------+
|   FluxFactory    | --> |    FluxPool(s)   |  -- Constant product AMM (x * y = k)
+------------------+     +------------------+
                               |
                          ERC-20 LP Tokens
```

**Core contracts:**
- **FluxFactory** -- Permissionless pool creation. Anyone can list a new token pair. Uses CREATE2 for deterministic addresses.
- **FluxPool** -- AMM liquidity pool. Constant product formula, 0.3% swap fee, reentrancy-guarded, cumulative price oracle.
- **FluxSwapRouter** -- User-facing entry point. Routes swaps (including multi-hop), handles ETH/WETH wrapping, enforces slippage + deadline.
- **WETH9** -- Canonical wrapped ETH for ERC-20 compatibility.
- **TokenFactory** -- Deploy new ERC-20 tokens permissionlessly (bonus utility).

---

## Features

**Trading**
- Constant product AMM (x * y = k) with 0.3% fee
- Multi-hop swap routing (A -> B -> C in one transaction)
- Slippage protection (amountOutMin / amountInMax)
- Deadline enforcement on all state-changing calls
- Native ETH support via automatic WETH wrapping

**Liquidity**
- Permissionless pool creation for any ERC-20 pair
- ERC-20 LP tokens proportional to pool share
- Add/remove liquidity with minimum amount guarantees
- Flash swap support

**Security**
- Reentrancy guards on all state-changing functions
- Integer overflow protection (Solidity 0.8+)
- Minimum liquidity lock (prevents pool manipulation)
- Comprehensive input validation

**Infrastructure**
- 96 passing tests (Foundry)
- Deterministic deployment with CREATE2
- Cumulative price oracle for TWAP integrations
- Gas-optimized with `via_ir` compilation

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Smart Contracts | Solidity 0.8.20 |
| Framework | Foundry (forge, cast, anvil) |
| Testing | Foundry Test (96 tests) |
| Dependencies | OpenZeppelin Contracts |
| Network | Ethereum Sepolia Testnet |
| Frontend | React 18, Vite, ethers.js v6, Tailwind CSS |

---

## Project Evolution

This project started as **ArcSwap** (Hardhat + React) and evolved into **Flux Protocol** (Foundry + production deployment):

| Phase | Stack | Status |
|-------|-------|--------|
| v1 -- ArcSwap | Hardhat, ethers.js, React | Completed |
| v2 -- Flux Protocol | Foundry, OpenZeppelin, CREATE2 | **Live on Sepolia** |

Key improvements in v2:
- Migrated from Hardhat to Foundry for faster compilation and better testing
- Added `via_ir` compilation for complex router optimization
- 96 comprehensive tests (unit + integration + edge cases)
- Production deployment with deterministic addresses
- Seeded initial liquidity pool

---

## Quick Start

```bash
# Clone
git clone https://github.com/Hamz04/arc-swap.git
cd arc-swap

# Install Foundry (if needed)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Build
cd contracts
forge build

# Test (96 tests)
forge test -vv

# Deploy to local Anvil
anvil &
forge script script/DeployProtocol.s.sol --broadcast --rpc-url http://localhost:8545
```

---

## Test Coverage

```
96 tests, 95 passing

Covered areas:
- Pool creation and initialization
- Token swaps (exact input / exact output)
- Multi-hop routing
- Liquidity add/remove
- Edge cases (zero amounts, identical tokens, deadline expiry)
- Reentrancy protection
- Fee calculation accuracy
- WETH wrapping/unwrapping
- Factory permissionless listing
```

---

## License

MIT
