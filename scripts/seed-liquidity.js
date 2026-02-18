/**
 * HamzaDEX Seed Liquidity Script
 * ─────────────────────────────────────────────────────────────────
 * Reads deployed contract addresses from deployments/<network>.json
 * and seeds initial liquidity into all three pools:
 *   • HAMZA/WETH  — 100,000 HAMZA : 50 WETH  (price: 2000 HAMZA/WETH)
 *   • HAMZA/USDC  — 100,000 HAMZA : 200,000 USDC (price: 2 USDC/HAMZA)
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
  "HAMZA/WETH": {
    amountA: ethers.parseEther("100000"), // 100,000 HAMZA
    amountB: ethers.parseEther("50"),     // 50 WETH  → 1 WETH = 2,000 HAMZA
  },
  "HAMZA/USDC": {
    amountA: ethers.parseEther("100000"), // 100,000 HAMZA
    amountB: ethers.parseEther("200000"), // 200,000 USDC → 1 HAMZA = 2 USDC
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
  const tokenContract = await ethers.getContractAt("HamzaToken", token, signer);
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
  const tokenContract = await ethers.getContractAt("HamzaToken", token, signer);
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
  console.log("║         HamzaDEX — Seed Liquidity Script             ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`\n  Network  : ${networkName}`);
  console.log(`  Provider : ${deployer.address}\n`);

  // ─── Load deployed addresses ──────────────────────────────────
  const deployments = loadDeployments(networkName);
  const {
    HamzaToken: hamzaAddress,
    WETHToken: wethAddress,
    USDCToken: usdcAddress,
    HamzaSwap: swapAddress,
  } = deployments;

  console.log("  Loaded deployment addresses:");
  console.log(`    HAMZA    : ${hamzaAddress}`);
  console.log(`    WETH     : ${wethAddress}`);
  console.log(`    USDC     : ${usdcAddress}`);
  console.log(`    Router   : ${swapAddress}\n`);

  // ─── Connect to router ────────────────────────────────────────
  const router = await ethers.getContractAt("HamzaSwap", swapAddress, deployer);

  // ─── Ensure sufficient token balances ────────────────────────
  console.log("  [1/4] Ensuring token balances...");
  const totalHamza = LIQUIDITY_CONFIG["HAMZA/WETH"].amountA + LIQUIDITY_CONFIG["HAMZA/USDC"].amountA;
  const totalWeth  = LIQUIDITY_CONFIG["HAMZA/WETH"].amountB + LIQUIDITY_CONFIG["WETH/USDC"].amountA;
  const totalUsdc  = LIQUIDITY_CONFIG["HAMZA/USDC"].amountB + LIQUIDITY_CONFIG["WETH/USDC"].amountB;

  await mintIfNeeded(hamzaAddress, deployer.address, totalHamza, deployer);
  await mintIfNeeded(wethAddress,  deployer.address, totalWeth,  deployer);
  await mintIfNeeded(usdcAddress,  deployer.address, totalUsdc,  deployer);

  // ─── Approve router to spend all tokens ──────────────────────
  console.log("\n  [2/4] Approving router...");
  await approveToken(hamzaAddress, swapAddress, totalHamza, deployer);
  await approveToken(wethAddress,  swapAddress, totalWeth,  deployer);
  await approveToken(usdcAddress,  swapAddress, totalUsdc,  deployer);

  // ─── Seed HAMZA/WETH pool ─────────────────────────────────────
  console.log("\n  [3/4] Seeding HAMZA/WETH pool...");
  {
    const { amountA, amountB } = LIQUIDITY_CONFIG["HAMZA/WETH"];
    const tx = await router.addLiquidity(
      hamzaAddress,
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
      console.log(`    ✓ Added ${ethers.formatEther(event.args.amountA)} HAMZA`);
      console.log(`    ✓ Added ${ethers.formatEther(event.args.amountB)} WETH`);
      console.log(`    ✓ LP tokens minted: ${ethers.formatEther(event.args.liquidity)}`);
    }

    // Verify price
    const price = await router.getPrice(hamzaAddress, wethAddress);
    console.log(`    ✓ HAMZA/WETH spot price: ${ethers.formatEther(price)} WETH per HAMZA`);
  }

  // ─── Seed HAMZA/USDC pool ─────────────────────────────────────
  console.log("\n  [4/4] Seeding HAMZA/USDC pool...");
  {
    const { amountA, amountB } = LIQUIDITY_CONFIG["HAMZA/USDC"];
    const tx = await router.addLiquidity(
      hamzaAddress,
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
      console.log(`    ✓ Added ${ethers.formatEther(event.args.amountA)} HAMZA`);
      console.log(`    ✓ Added ${ethers.formatEther(event.args.amountB)} USDC`);
      console.log(`    ✓ LP tokens minted: ${ethers.formatEther(event.args.liquidity)}`);
    }

    const price = await router.getPrice(hamzaAddress, usdcAddress);
    console.log(`    ✓ HAMZA/USDC spot price: ${ethers.formatEther(price)} USDC per HAMZA`);
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
  console.log("\n  Verifying multi-hop quote (HAMZA -> WETH -> USDC)...");
  const testAmountIn = ethers.parseEther("1000"); // 1000 HAMZA
  const [, , outUsdc] = await router.getAmountsOut(testAmountIn, [
    hamzaAddress,
    wethAddress,
    usdcAddress,
  ]);
  console.log(`    ✓ 1,000 HAMZA → WETH → ~${ethers.formatEther(outUsdc)} USDC`);

  // ─── Update deployments file with seed info ────────────────────
  const depFile = path.join(__dirname, "..", "deployments", `${networkName}.json`);
  const deps = JSON.parse(fs.readFileSync(depFile, "utf8"));
  deps.seededAt = new Date().toISOString();
  deps.initialPrices = {
    "HAMZA/WETH": "0.0005 WETH per HAMZA (2000 HAMZA per WETH)",
    "HAMZA/USDC": "2 USDC per HAMZA",
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
