/**
 * ArcSwap Deployment Script
 * ─────────────────────────────────────────────────────────────────
 * Deploys:
 *   1. ArcToken (ARC) — primary governance/utility token
 *   2. ArcToken (WETH)  — wrapped ETH mock for testnet
 *   3. ArcToken (USDC)  — stablecoin mock for testnet
 *   4. ArcSwap router
 *   5. Creates ARC/WETH and ARC/USDC pairs
 *   6. Verifies all contracts on Etherscan (when --network sepolia)
 *   7. Saves deployed addresses to deployments/<network>.json
 *
 * Usage:
 *   npx hardhat run scripts/deploy.js --network localhost
 *   npx hardhat run scripts/deploy.js --network sepolia
 */

const { ethers, network, run } = require("hardhat");
const fs = require("fs");
const path = require("path");

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function verifyContract(address, constructorArguments) {
  console.log(`\n  Verifying ${address} on Etherscan...`);
  try {
    await run("verify:verify", { address, constructorArguments });
    console.log(`  ✓ Verified: ${address}`);
  } catch (err) {
    if (err.message.includes("Already Verified") || err.message.includes("already verified")) {
      console.log(`  ✓ Already verified: ${address}`);
    } else {
      console.warn(`  ✗ Verification failed: ${err.message}`);
    }
  }
}

function saveDeployments(networkName, deployments) {
  const dir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, `${networkName}.json`);
  const existing = fs.existsSync(filePath)
    ? JSON.parse(fs.readFileSync(filePath, "utf8"))
    : {};

  const merged = {
    ...existing,
    ...deployments,
    network: networkName,
    deployedAt: new Date().toISOString(),
    blockNumber: deployments._blockNumber,
  };

  delete merged._blockNumber;
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2));
  console.log(`\n  Deployments saved to deployments/${networkName}.json`);
}

// ─────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────

async function main() {
  const [deployer] = await ethers.getSigners();
  const networkName = network.name;
  const isTestnet = networkName === "sepolia";
  const isLocal = networkName === "localhost" || networkName === "hardhat";

  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║           ArcSwap — Deployment Script               ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`\n  Network  : ${networkName}`);
  console.log(`  Deployer : ${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`  Balance  : ${ethers.formatEther(balance)} ETH`);
  console.log(`  Timestamp: ${new Date().toISOString()}\n`);

  if (balance === 0n) {
    throw new Error("Deployer has zero ETH balance. Fund the account first.");
  }

  const deployments = {};
  const block = await ethers.provider.getBlockNumber();
  deployments._blockNumber = block;

  // ─── 1. Deploy ArcToken (ARC) ───────────────────────────────
  console.log("  [1/6] Deploying ArcToken (ARC)...");
  const ArcToken = await ethers.getContractFactory("ArcToken");
  const arcToken = await ArcToken.deploy("ArcToken", "ARC", deployer.address);
  await arcToken.waitForDeployment();
  const arcAddress = await arcToken.getAddress();
  deployments.ArcToken = arcAddress;
  console.log(`    ✓ ArcToken (ARC) deployed at: ${arcAddress}`);

  // ─── 2. Deploy mock WETH ────────────────────────────────────────
  console.log("  [2/6] Deploying mock WETH...");
  const wethToken = await ArcToken.deploy("Wrapped Ether", "WETH", deployer.address);
  await wethToken.waitForDeployment();
  const wethAddress = await wethToken.getAddress();
  deployments.WETHToken = wethAddress;
  console.log(`    ✓ WETH mock deployed at: ${wethAddress}`);

  // ─── 3. Deploy mock USDC ────────────────────────────────────────
  console.log("  [3/6] Deploying mock USDC...");
  const usdcToken = await ArcToken.deploy("USD Coin", "USDC", deployer.address);
  await usdcToken.waitForDeployment();
  const usdcAddress = await usdcToken.getAddress();
  deployments.USDCToken = usdcAddress;
  console.log(`    ✓ USDC mock deployed at: ${usdcAddress}`);

  // ─── 4. Deploy ArcSwap Router ─────────────────────────────────
  console.log("  [4/6] Deploying ArcSwap router...");
  const ArcSwap = await ethers.getContractFactory("ArcSwap");
  const arcSwap = await ArcSwap.deploy(deployer.address);
  await arcSwap.waitForDeployment();
  const swapAddress = await arcSwap.getAddress();
  deployments.ArcSwap = swapAddress;
  console.log(`    ✓ ArcSwap router deployed at: ${swapAddress}`);

  // ─── 5. Create ARC/WETH pair ───────────────────────────────────
  console.log("  [5/6] Creating ARC/WETH pair...");
  const tx1 = await arcSwap.createPair(arcAddress, wethAddress);
  const receipt1 = await tx1.wait();
  const pairCreatedEvent1 = receipt1.logs
    .map((log) => { try { return arcSwap.interface.parseLog(log); } catch { return null; } })
    .find((e) => e && e.name === "PairCreated");
  const arcWethPair = pairCreatedEvent1.args.pair;
  deployments.ARCWETHPair = arcWethPair;
  console.log(`    ✓ ARC/WETH pair: ${arcWethPair}`);

  // ─── 6. Create ARC/USDC pair ───────────────────────────────────
  console.log("  [6/6] Creating ARC/USDC pair...");
  const tx2 = await arcSwap.createPair(arcAddress, usdcAddress);
  const receipt2 = await tx2.wait();
  const pairCreatedEvent2 = receipt2.logs
    .map((log) => { try { return arcSwap.interface.parseLog(log); } catch { return null; } })
    .find((e) => e && e.name === "PairCreated");
  const arcUsdcPair = pairCreatedEvent2.args.pair;
  deployments.ARCUSDCPair = arcUsdcPair;
  console.log(`    ✓ ARC/USDC pair: ${arcUsdcPair}`);

  // Also create WETH/USDC pair for multi-hop routing
  console.log("  [+] Creating WETH/USDC pair (for multi-hop)...");
  const tx3 = await arcSwap.createPair(wethAddress, usdcAddress);
  const receipt3 = await tx3.wait();
  const pairCreatedEvent3 = receipt3.logs
    .map((log) => { try { return arcSwap.interface.parseLog(log); } catch { return null; } })
    .find((e) => e && e.name === "PairCreated");
  const wethUsdcPair = pairCreatedEvent3.args.pair;
  deployments.WETHUSDCPair = wethUsdcPair;
  console.log(`    ✓ WETH/USDC pair: ${wethUsdcPair}`);

  // ─── Save deployments ────────────────────────────────────────────
  saveDeployments(networkName, deployments);

  // ─── Etherscan verification (Sepolia only) ───────────────────────
  if (isTestnet) {
    console.log("\n  Waiting 30s for Etherscan to index contracts...");
    await sleep(30000);

    await verifyContract(arcAddress, ["ArcToken", "ARC", deployer.address]);
    await verifyContract(wethAddress,  ["Wrapped Ether", "WETH", deployer.address]);
    await verifyContract(usdcAddress,  ["USD Coin", "USDC", deployer.address]);
    await verifyContract(swapAddress,  [deployer.address]);
  }

  // ─── Summary ─────────────────────────────────────────────────────
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║                Deployment Summary                    ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`  ArcToken (ARC) : ${arcAddress}`);
  console.log(`  WETH (mock)        : ${wethAddress}`);
  console.log(`  USDC (mock)        : ${usdcAddress}`);
  console.log(`  ArcSwap Router   : ${swapAddress}`);
  console.log(`  ARC/WETH Pair    : ${arcWethPair}`);
  console.log(`  ARC/USDC Pair    : ${arcUsdcPair}`);
  console.log(`  WETH/USDC Pair     : ${wethUsdcPair}`);

  if (isLocal) {
    console.log("\n  Next step: npx hardhat run scripts/seed-liquidity.js --network localhost");
  } else if (isTestnet) {
    console.log("\n  Next step: npx hardhat run scripts/seed-liquidity.js --network sepolia");
  }
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n  DEPLOYMENT FAILED:", err.message);
    process.exit(1);
  });
