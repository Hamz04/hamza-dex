/**
 * ArcSwap Seed Liquidity Script
 * ─────────────────────────────────────────────────────────────────
 * Reads deployed contract addresses from deployments/<network>.json
 * and seeds initial liquidity into all three pools:
 *   • ARC/WETH  — 100,000 ARC : 50 WETH  (price: 2000 ARC/WETH)
 *   • ARC/USDC  — 100,000 ARC : 200,000 USDC (price: 2 USDC/ARC)
 *   • WETH/USDC   — 50 WETH : 100,000 USDC (price: 2000 USDC/WETH)
 *
 * Usage:
 *   npx hardhat run scripts/seed-liquidity.js --network localhost
 *   npx hardhat run scripts/seed-liquidity.js --network sepolia
 */

const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// ─────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────

const LIQUIDITY_CONFIG = {
  "ARC/WETH": {
    amountA: ethers.parseEther("100000"), // 100,000 ARC
    amountB: ethers.parseEther("50"),     // 50 WETH  → 1 WETH = 2,000 ARC
  },
  "ARC/USDC": {
    amountA: ethers.parseEther("100000"), // 100,000 ARC
    amountB: ethers.parseEther("200000"), // 200,000 USDC → 1 ARC = 2 USDC
  },
  "WETH/USDC": {
    amountA: ethers.parseEther("50"),     // 50 WETH
    amountB: ethers.parseEther("100000"), // 100,000 USDC → 1 WETH = 2,000 USDC
  },
};

const DEADLINE_MINUTES = 20;

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function loadDeployments(networkName) {
  const filePath = path.join(__dirname, "..", "deployments", `${networkName}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `No deployments found for network "${networkName}". Run deploy.js first.`
    );
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function deadline() {
  return Math.floor(Date.now() / 1000) + DEADLINE_MINUTES * 60;
}

async function approveToken(token, spender, amount, signer) {
  const tokenContract = await ethers.getContractAt("ArcToken", token, signer);
  const symbol = await tokenContract.symbol();
  const current = await tokenContract.allowance(signer.address, spender);

  if (current >= amount) {
    console.log(`    ✓ ${symbol} already approved`);
    return;
  }

  const tx = await tokenContract.approve(spender, amount);
  await tx.wait();
  console.log(`    ✓ Approved ${ethers.formatEther(amount)} ${symbol}`);
}

async function mintIfNeeded(token, to, amount, signer) {
  const tokenContract = await ethers.getContractAt("ArcToken", token, signer);
  const symbol = await tokenContract.symbol();
  const balance = await tokenContract.balanceOf(to);

  if (balance >= amount) {
    console.log(`    ✓ ${symbol} balance sufficient (${ethers.formatEther(balance)})`);
    return;
  }

  const needed = amount - balance;
  const tx = await tokenContract.mint(to, needed);
  await tx.wait();
  console.log(`    ✓ Minted ${ethers.formatEther(needed)} ${symbol} (total: ${ethers.formatEther(amount)})`);
}

// ─────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────

async function main() {
  const [deployer] = await ethers.getSigners();
  const networkName = network.name;

  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║         ArcSwap — Seed Liquidity Script             ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`\n  Network  : ${networkName}`);
  console.log(`  Provider : ${deployer.address}\n`);

  // ─── Load deployed addresses ──────────────────────────────────
  const deployments = loadDeployments(networkName);
  const {
    ArcToken: arcAddress,
    WETHToken: wethAddress,
    USDCToken: usdcAddress,
    ArcSwap: swapAddress,
  } = deployments;

  console.log("  Loaded deployment addresses:");
  console.log(`    ARC    : ${arcAddress}`);
  console.log(`    WETH     : ${wethAddress}`);
  console.log(`    USDC     : ${usdcAddress}`);
  console.log(`    Router   : ${swapAddress}\n`);

  // ─── Connect to router ────────────────────────────────────────
  const router = await ethers.getContractAt("ArcSwap", swapAddress, deployer);

  // ─── Ensure sufficient token balances ────────────────────────
  console.log("  [1/4] Ensuring token balances...");
  const totalArc = LIQUIDITY_CONFIG["ARC/WETH"].amountA + LIQUIDITY_CONFIG["ARC/USDC"].amountA;
  const totalWeth  = LIQUIDITY_CONFIG["ARC/WETH"].amountB + LIQUIDITY_CONFIG["WETH/USDC"].amountA;
  const totalUsdc  = LIQUIDITY_CONFIG["ARC/USDC"].amountB + LIQUIDITY_CONFIG["WETH/USDC"].amountB;

  await mintIfNeeded(arcAddress, deployer.address, totalArc, deployer);
  await mintIfNeeded(wethAddress,  deployer.address, totalWeth,  deployer);
  await mintIfNeeded(usdcAddress,  deployer.address, totalUsdc,  deployer);

  // ─── Approve router to spend all tokens ──────────────────────
  console.log("\n  [2/4] Approving router...");
  await approveToken(arcAddress, swapAddress, totalArc, deployer);
  await approveToken(wethAddress,  swapAddress, totalWeth,  deployer);
  await approveToken(usdcAddress,  swapAddress, totalUsdc,  deployer);

  // ─── Seed ARC/WETH pool ─────────────────────────────────────
  console.log("\n  [3/4] Seeding ARC/WETH pool...");
  {
    const { amountA, amountB } = LIQUIDITY_CONFIG["ARC/WETH"];
    const tx = await router.addLiquidity(
      arcAddress,
      wethAddress,
      amountA,
      amountB,
      (amountA * 99n) / 100n, // 1% slippage tolerance
      (amountB * 99n) / 100n,
      deployer.address,
      deadline()
    );
    const receipt = await tx.wait();

    const event = receipt.logs
      .map((log) => { try { return router.interface.parseLog(log); } catch { return null; } })
      .find((e) => e && e.name === "LiquidityAdded");

    if (event) {
      console.log(`    ✓ Added ${ethers.formatEther(event.args.amountA)} ARC`);
      console.log(`    ✓ Added ${ethers.formatEther(event.args.amountB)} WETH`);
      console.log(`    ✓ LP tokens minted: ${ethers.formatEther(event.args.liquidity)}`);
    }

    // Verify price
    const price = await router.getPrice(arcAddress, wethAddress);
    console.log(`    ✓ ARC/WETH spot price: ${ethers.formatEther(price)} WETH per ARC`);
  }

  // ─── Seed ARC/USDC pool ─────────────────────────────────────
  console.log("\n  [4/4] Seeding ARC/USDC pool...");
  {
    const { amountA, amountB } = LIQUIDITY_CONFIG["ARC/USDC"];
    const tx = await router.addLiquidity(
      arcAddress,
      usdcAddress,
      amountA,
      amountB,
      (amountA * 99n) / 100n,
      (amountB * 99n) / 100n,
      deployer.address,
      deadline()
    );
    const receipt = await tx.wait();

    const event = receipt.logs
      .map((log) => { try { return router.interface.parseLog(log); } catch { return null; } })
      .find((e) => e && e.name === "LiquidityAdded");

    if (event) {
      console.log(`    ✓ Added ${ethers.formatEther(event.args.amountA)} ARC`);
      console.log(`    ✓ Added ${ethers.formatEther(event.args.amountB)} USDC`);
      console.log(`    ✓ LP tokens minted: ${ethers.formatEther(event.args.liquidity)}`);
    }

    const price = await router.getPrice(arcAddress, usdcAddress);
    console.log(`    ✓ ARC/USDC spot price: ${ethers.formatEther(price)} USDC per ARC`);
  }

  // ─── Seed WETH/USDC pool ──────────────────────────────────────
  console.log("\n  [+] Seeding WETH/USDC pool...");
  {
    const { amountA, amountB } = LIQUIDITY_CONFIG["WETH/USDC"];
    const tx = await router.addLiquidity(
      wethAddress,
      usdcAddress,
      amountA,
      amountB,
      (amountA * 99n) / 100n,
      (amountB * 99n) / 100n,
      deployer.address,
      deadline()
    );
    await tx.wait();

    const price = await router.getPrice(wethAddress, usdcAddress);
    console.log(`    ✓ WETH/USDC spot price: ${ethers.formatEther(price)} USDC per WETH`);
  }

  // ─── Verify multi-hop route quote ─────────────────────────────
  console.log("\n  Verifying multi-hop quote (ARC -> WETH -> USDC)...");
  const testAmountIn = ethers.parseEther("1000"); // 1000 ARC
  const [, , outUsdc] = await router.getAmountsOut(testAmountIn, [
    arcAddress,
    wethAddress,
    usdcAddress,
  ]);
  console.log(`    ✓ 1,000 ARC → WETH → ~${ethers.formatEther(outUsdc)} USDC`);

  // ─── Update deployments file with seed info ────────────────────
  const depFile = path.join(__dirname, "..", "deployments", `${networkName}.json`);
  const deps = JSON.parse(fs.readFileSync(depFile, "utf8"));
  deps.seededAt = new Date().toISOString();
  deps.initialPrices = {
    "ARC/WETH": "0.0005 WETH per ARC (2000 ARC per WETH)",
    "ARC/USDC": "2 USDC per ARC",
    "WETH/USDC": "2000 USDC per WETH",
  };
  fs.writeFileSync(depFile, JSON.stringify(deps, null, 2));

  console.log("\n  ✓ Liquidity seeded successfully!");
  console.log("  ✓ deployments file updated with seed info\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n  SEED FAILED:", err.message);
    console.error(err);
    process.exit(1);
  });
