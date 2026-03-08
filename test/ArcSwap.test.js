/**
 * ArcSwap.test.js
 * ─────────────────────────────────────────────────────────────────
 * Comprehensive tests for the ArcSwap AMM router:
 *   - Swap math (constant product formula verification)
 *   - Fee calculation (0.3%)
 *   - Slippage protection (amountOutMin)
 *   - Deadline enforcement
 *   - Multi-hop routing (3-token path)
 *   - Pair creation and management
 *   - Price queries
 *   - swapTokensForExactTokens
 *   - Edge cases and error conditions
 */

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────

const DEADLINE_OFFSET = 20 * 60; // 20 minutes from now

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function deadline() {
  return Math.floor(Date.now() / 1000) + DEADLINE_OFFSET;
}

function calcExpectedOut(amountIn, reserveIn, reserveOut) {
  // Mirrors getAmountOut: amountIn*997*reserveOut / (reserveIn*1000 + amountIn*997)
  const amountInWithFee = amountIn * 997n;
  const numerator = amountInWithFee * reserveOut;
  const denominator = reserveIn * 1000n + amountInWithFee;
  return numerator / denominator;
}

function calcExpectedIn(amountOut, reserveIn, reserveOut) {
  // Mirrors getAmountIn
  const numerator = reserveIn * amountOut * 1000n;
  const denominator = (reserveOut - amountOut) * 997n;
  return numerator / denominator + 1n;
}

// ─────────────────────────────────────────────────────────────────
// Fixture
// ─────────────────────────────────────────────────────────────────

async function deployDEXFixture() {
  const [owner, alice, bob, carol] = await ethers.getSigners();

  const ArcToken = await ethers.getContractFactory("ArcToken");
  const ArcSwap  = await ethers.getContractFactory("ArcSwap");

  // Deploy three tokens
  const tokenA = await ArcToken.deploy("Token A", "TKA", owner.address);
  const tokenB = await ArcToken.deploy("Token B", "TKB", owner.address);
  const tokenC = await ArcToken.deploy("Token C", "TKC", owner.address);

  const router = await ArcSwap.deploy(owner.address);

  const addrA = await tokenA.getAddress();
  const addrB = await tokenB.getAddress();
  const addrC = await tokenC.getAddress();
  const routerAddr = await router.getAddress();

  // Mint generous amounts to alice and bob
  const MINT = ethers.parseEther("10000000");
  for (const token of [tokenA, tokenB, tokenC]) {
    await token.mint(alice.address, MINT);
    await token.mint(bob.address, MINT);
    await token.mint(carol.address, MINT);
  }

  // Helper: approve router for a signer
  async function approveAll(signer) {
    for (const token of [tokenA, tokenB, tokenC]) {
      await token.connect(signer).approve(routerAddr, ethers.MaxUint256);
    }
  }
  await approveAll(owner);
  await approveAll(alice);
  await approveAll(bob);
  await approveAll(carol);

  // Approve owner's initial supply too
  for (const token of [tokenA, tokenB, tokenC]) {
    await token.connect(owner).approve(routerAddr, ethers.MaxUint256);
  }

  // Create A/B and A/C and B/C pairs
  await router.createPair(addrA, addrB);
  await router.createPair(addrA, addrC);
  await router.createPair(addrB, addrC);

  const pairAB = await router.getPair(addrA, addrB);
  const pairAC = await router.getPair(addrA, addrC);
  const pairBC = await router.getPair(addrB, addrC);

  // Seed A/B pool: 100,000 A : 200,000 B  → 1 A = 2 B
  const seedA = ethers.parseEther("100000");
  const seedB = ethers.parseEther("200000");
  await router.connect(alice).addLiquidity(
    addrA, addrB, seedA, seedB, 0n, 0n, alice.address, deadline()
  );

  // Seed A/C pool: 100,000 A : 50,000 C   → 1 A = 0.5 C
  const seedC = ethers.parseEther("50000");
  await router.connect(alice).addLiquidity(
    addrA, addrC, seedA, seedC, 0n, 0n, alice.address, deadline()
  );

  // Seed B/C pool: 200,000 B : 50,000 C   → 1 B = 0.25 C
  await router.connect(alice).addLiquidity(
    addrB, addrC, seedB, seedC, 0n, 0n, alice.address, deadline()
  );

  return {
    owner, alice, bob, carol,
    tokenA, tokenB, tokenC,
    router, routerAddr,
    addrA, addrB, addrC,
    pairAB, pairAC, pairBC,
    seedA, seedB, seedC,
  };
}

// ─────────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────────

describe("ArcSwap", function () {

  // ───────────────────────────────────────────────────────────────
  // 1. Pair Management
  // ───────────────────────────────────────────────────────────────
  describe("Pair Management", function () {
    it("should have created 3 pairs", async function () {
      const { router } = await loadFixture(deployDEXFixture);
      expect(await router.allPairsLength()).to.equal(3n);
    });

    it("should return same pair address regardless of token order", async function () {
      const { router, addrA, addrB } = await loadFixture(deployDEXFixture);
      const pairAB = await router.getPair(addrA, addrB);
      const pairBA = await router.getPair(addrB, addrA);
      expect(pairAB).to.equal(pairBA);
      expect(pairAB).to.not.equal(ethers.ZeroAddress);
    });

    it("should revert on duplicate pair creation", async function () {
      const { router, addrA, addrB } = await loadFixture(deployDEXFixture);
      await expect(router.createPair(addrA, addrB)).to.be.reverted;
    });

    it("should revert on identical token pair", async function () {
      const { router, addrA } = await loadFixture(deployDEXFixture);
      await expect(router.createPair(addrA, addrA)).to.be.reverted;
    });

    it("should revert on zero address token", async function () {
      const { router, addrA } = await loadFixture(deployDEXFixture);
      await expect(router.createPair(addrA, ethers.ZeroAddress)).to.be.reverted;
    });

    it("should emit PairCreated event with correct args", async function () {
      const [owner] = await ethers.getSigners();
      const ArcToken = await ethers.getContractFactory("ArcToken");
      const ArcSwap  = await ethers.getContractFactory("ArcSwap");
      const t1 = await ArcToken.deploy("T1", "T1", owner.address);
      const t2 = await ArcToken.deploy("T2", "T2", owner.address);
      const r  = await ArcSwap.deploy(owner.address);
      const addr1 = await t1.getAddress();
      const addr2 = await t2.getAddress();
      const tx = await r.createPair(addr1, addr2);
      await expect(tx).to.emit(r, "PairCreated");
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 2. Swap Math (Constant Product)
  // ───────────────────────────────────────────────────────────────
  describe("Swap Math — Constant Product", function () {
    it("getAmountOut should match formula: (in*997*rOut)/(rIn*1000+in*997)", async function () {
      const { router } = await loadFixture(deployDEXFixture);
      const amountIn   = ethers.parseEther("1000");
      const reserveIn  = ethers.parseEther("100000");
      const reserveOut = ethers.parseEther("200000");

      const expected = calcExpectedOut(amountIn, reserveIn, reserveOut);
      const actual   = await router.getAmountOut(amountIn, reserveIn, reserveOut);
      expect(actual).to.equal(expected);
    });

    it("getAmountIn should match reverse formula", async function () {
      const { router } = await loadFixture(deployDEXFixture);
      const amountOut  = ethers.parseEther("500");
      const reserveIn  = ethers.parseEther("100000");
      const reserveOut = ethers.parseEther("200000");

      const expected = calcExpectedIn(amountOut, reserveIn, reserveOut);
      const actual   = await router.getAmountIn(amountOut, reserveIn, reserveOut);
      expect(actual).to.equal(expected);
    });

    it("getAmountOut with zero input should revert", async function () {
      const { router } = await loadFixture(deployDEXFixture);
      await expect(
        router.getAmountOut(0n, ethers.parseEther("1000"), ethers.parseEther("1000"))
      ).to.be.reverted;
    });

    it("getAmountOut with zero reserve should revert", async function () {
      const { router } = await loadFixture(deployDEXFixture);
      await expect(
        router.getAmountOut(ethers.parseEther("1"), 0n, ethers.parseEther("1000"))
      ).to.be.reverted;
    });

    it("getAmountsOut should compute correct multi-hop path", async function () {
      const { router, addrA, addrB, addrC, seedA, seedB, seedC } = await loadFixture(deployDEXFixture);
      const amountIn = ethers.parseEther("1000");
      const amounts  = await router.getAmountsOut(amountIn, [addrA, addrB, addrC]);

      expect(amounts[0]).to.equal(amountIn);

      // First hop: A -> B
      const expectedB = calcExpectedOut(amountIn, seedA, seedB);
      expect(amounts[1]).to.equal(expectedB);

      // Second hop: B -> C
      const expectedC = calcExpectedOut(expectedB, seedB, seedC);
      expect(amounts[2]).to.equal(expectedC);
    });

    it("getAmountsIn should compute correct reverse path", async function () {
      const { router, addrA, addrB, seedA, seedB } = await loadFixture(deployDEXFixture);
      const amountOut = ethers.parseEther("100");
      const amounts   = await router.getAmountsIn(amountOut, [addrA, addrB]);

      expect(amounts[amounts.length - 1]).to.equal(amountOut);
      const expected = calcExpectedIn(amountOut, seedA, seedB);
      expect(amounts[0]).to.equal(expected);
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 3. Fee Calculation (0.3%)
  // ───────────────────────────────────────────────────────────────
  describe("Fee Calculation (0.3%)", function () {
    it("output should be less than no-fee price by exactly 0.3%", async function () {
      const { router } = await loadFixture(deployDEXFixture);
      const amountIn   = ethers.parseEther("1000");
      const reserveIn  = ethers.parseEther("100000");
      const reserveOut = ethers.parseEther("200000");

      // No-fee output: amountIn * reserveOut / (reserveIn + amountIn)
      const noFeeOut = (amountIn * reserveOut) / (reserveIn + amountIn);
      const withFeeOut = await router.getAmountOut(amountIn, reserveIn, reserveOut);

      // withFeeOut < noFeeOut (fee retained in pool)
      expect(withFeeOut).to.be.lt(noFeeOut);

      // Effective fee: (noFeeOut - withFeeOut) / noFeeOut ≈ 0.3%
      // Use BigInt arithmetic: multiply by 10000 for basis points
      const feeBps = ((noFeeOut - withFeeOut) * 10000n) / noFeeOut;
      // Should be approximately 30 bps (0.3%), allow ±2 bps rounding
      expect(feeBps).to.be.gte(28n);
      expect(feeBps).to.be.lte(32n);
    });

    it("k should be preserved (or slightly increased) after swap", async function () {
      const { router, bob, addrA, addrB, pairAB } = await loadFixture(deployDEXFixture);
      const LiqPool = await ethers.getContractAt("LiquidityPool", pairAB);

      const [rA0, rB0] = await LiqPool.getReserves();
      const k0 = rA0 * rB0;

      await router.connect(bob).swapExactTokensForTokens(
        ethers.parseEther("1000"),
        0n,
        [addrA, addrB],
        bob.address,
        deadline()
      );

      const [rA1, rB1] = await LiqPool.getReserves();
      const k1 = rA1 * rB1;

      // k should only increase (fee stays in pool)
      expect(k1).to.be.gte(k0);
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 4. swapExactTokensForTokens
  // ───────────────────────────────────────────────────────────────
  describe("swapExactTokensForTokens", function () {
    it("should transfer correct output amount to recipient", async function () {
      const { router, bob, addrA, addrB, seedA, seedB } = await loadFixture(deployDEXFixture);
      const amountIn = ethers.parseEther("500");

      const tokenB = await ethers.getContractAt("ArcToken", addrB);
      const balBefore = await tokenB.balanceOf(bob.address);

      const amounts = await router.getAmountsOut(amountIn, [addrA, addrB]);
      await router.connect(bob).swapExactTokensForTokens(
        amountIn, 0n, [addrA, addrB], bob.address, deadline()
      );

      const balAfter = await tokenB.balanceOf(bob.address);
      expect(balAfter - balBefore).to.equal(amounts[1]);
    });

    it("should deduct correct input amount from sender", async function () {
      const { router, bob, addrA, addrB } = await loadFixture(deployDEXFixture);
      const amountIn = ethers.parseEther("500");
      const tokenA = await ethers.getContractAt("ArcToken", addrA);
      const balBefore = await tokenA.balanceOf(bob.address);

      await router.connect(bob).swapExactTokensForTokens(
        amountIn, 0n, [addrA, addrB], bob.address, deadline()
      );

      const balAfter = await tokenA.balanceOf(bob.address);
      expect(balBefore - balAfter).to.equal(amountIn);
    });

    it("should emit Swap event", async function () {
      const { router, bob, addrA, addrB } = await loadFixture(deployDEXFixture);
      await expect(
        router.connect(bob).swapExactTokensForTokens(
          ethers.parseEther("100"), 0n, [addrA, addrB], bob.address, deadline()
        )
      ).to.emit(router, "Swap");
    });

    it("should update pool reserves after swap", async function () {
      const { router, bob, addrA, addrB, pairAB } = await loadFixture(deployDEXFixture);
      const LiqPool = await ethers.getContractAt("LiquidityPool", pairAB);
      const [rA0, rB0] = await LiqPool.getReserves();

      const amountIn = ethers.parseEther("1000");
      await router.connect(bob).swapExactTokensForTokens(
        amountIn, 0n, [addrA, addrB], bob.address, deadline()
      );

      const [rA1, rB1] = await LiqPool.getReserves();
      // ReserveA increased (bob sent tokenA in)
      expect(rA1).to.be.gt(rA0);
      // ReserveB decreased (bob received tokenB)
      expect(rB1).to.be.lt(rB0);
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 5. Slippage Protection
  // ───────────────────────────────────────────────────────────────
  describe("Slippage Protection", function () {
    it("should revert when output is below amountOutMin", async function () {
      const { router, bob, addrA, addrB } = await loadFixture(deployDEXFixture);
      const amountIn  = ethers.parseEther("1000");
      // Set amountOutMin to an impossibly high value
      const amountOutMin = ethers.parseEther("999999");

      await expect(
        router.connect(bob).swapExactTokensForTokens(
          amountIn, amountOutMin, [addrA, addrB], bob.address, deadline()
        )
      ).to.be.reverted;
    });

    it("should succeed when output meets amountOutMin exactly", async function () {
      const { router, bob, addrA, addrB } = await loadFixture(deployDEXFixture);
      const amountIn = ethers.parseEther("1000");
      const amounts  = await router.getAmountsOut(amountIn, [addrA, addrB]);
      const exact    = amounts[1];

      // Should not revert
      await expect(
        router.connect(bob).swapExactTokensForTokens(
          amountIn, exact, [addrA, addrB], bob.address, deadline()
        )
      ).to.not.be.reverted;
    });

    it("should succeed when amountOutMin = 0 (no slippage protection)", async function () {
      const { router, bob, addrA, addrB } = await loadFixture(deployDEXFixture);
      await expect(
        router.connect(bob).swapExactTokensForTokens(
          ethers.parseEther("100"), 0n, [addrA, addrB], bob.address, deadline()
        )
      ).to.not.be.reverted;
    });

    it("swapTokensForExactTokens should revert when input exceeds amountInMax", async function () {
      const { router, bob, addrA, addrB } = await loadFixture(deployDEXFixture);
      const amountOut  = ethers.parseEther("1000");
      const amountInMax = 1n; // absurdly low

      await expect(
        router.connect(bob).swapTokensForExactTokens(
          amountOut, amountInMax, [addrA, addrB], bob.address, deadline()
        )
      ).to.be.reverted;
    });

    it("swapTokensForExactTokens should give exact output", async function () {
      const { router, bob, addrA, addrB } = await loadFixture(deployDEXFixture);
      const tokenB = await ethers.getContractAt("ArcToken", addrB);
      const amountOut = ethers.parseEther("500");
      const balBefore = await tokenB.balanceOf(bob.address);

      await router.connect(bob).swapTokensForExactTokens(
        amountOut, ethers.MaxUint256, [addrA, addrB], bob.address, deadline()
      );

      const balAfter = await tokenB.balanceOf(bob.address);
      expect(balAfter - balBefore).to.equal(amountOut);
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 6. Deadline Enforcement
  // ───────────────────────────────────────────────────────────────
  describe("Deadline Enforcement", function () {
    it("should revert swap when deadline has passed", async function () {
      const { router, bob, addrA, addrB } = await loadFixture(deployDEXFixture);
      const pastDeadline = Math.floor(Date.now() / 1000) - 1; // 1 second ago

      await expect(
        router.connect(bob).swapExactTokensForTokens(
          ethers.parseEther("100"),
          0n,
          [addrA, addrB],
          bob.address,
          pastDeadline
        )
      ).to.be.reverted;
    });

    it("should revert addLiquidity when deadline has passed", async function () {
      const { router, bob, addrA, addrB } = await loadFixture(deployDEXFixture);
      const pastDeadline = Math.floor(Date.now() / 1000) - 1;

      await expect(
        router.connect(bob).addLiquidity(
          addrA, addrB,
          ethers.parseEther("1000"), ethers.parseEther("2000"),
          0n, 0n,
          bob.address,
          pastDeadline
        )
      ).to.be.reverted;
    });

    it("should revert when block.timestamp advances past deadline", async function () {
      const { router, bob, addrA, addrB } = await loadFixture(deployDEXFixture);
      const currentTime = await time.latest();
      const shortDeadline = currentTime + 60; // 60 seconds from now

      // Advance blockchain time by 2 minutes
      await time.increaseTo(currentTime + 120);

      await expect(
        router.connect(bob).swapExactTokensForTokens(
          ethers.parseEther("100"),
          0n,
          [addrA, addrB],
          bob.address,
          shortDeadline
        )
      ).to.be.reverted;
    });

    it("should succeed with future deadline", async function () {
      const { router, bob, addrA, addrB } = await loadFixture(deployDEXFixture);
      const futureDeadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour

      await expect(
        router.connect(bob).swapExactTokensForTokens(
          ethers.parseEther("100"),
          0n,
          [addrA, addrB],
          bob.address,
          futureDeadline
        )
      ).to.not.be.reverted;
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 7. Multi-Hop Routing
  // ───────────────────────────────────────────────────────────────
  describe("Multi-Hop Routing", function () {
    it("should execute 3-token swap: A -> B -> C", async function () {
      const { router, bob, addrA, addrB, addrC } = await loadFixture(deployDEXFixture);
      const tokenC = await ethers.getContractAt("ArcToken", addrC);
      const balBefore = await tokenC.balanceOf(bob.address);

      const amountIn = ethers.parseEther("1000");
      const amounts  = await router.getAmountsOut(amountIn, [addrA, addrB, addrC]);

      await router.connect(bob).swapExactTokensForTokens(
        amountIn, 0n, [addrA, addrB, addrC], bob.address, deadline()
      );

      const balAfter = await tokenC.balanceOf(bob.address);
      expect(balAfter - balBefore).to.equal(amounts[2]);
    });

    it("3-hop output should be less than 2-hop direct output (price impact compounding)", async function () {
      const { router, addrA, addrB, addrC } = await loadFixture(deployDEXFixture);
      const amountIn = ethers.parseEther("1000");

      // Direct: A -> C (if pool exists)
      const directAmounts = await router.getAmountsOut(amountIn, [addrA, addrC]);

      // 3-hop: A -> B -> C
      const multiAmounts = await router.getAmountsOut(amountIn, [addrA, addrB, addrC]);

      // Multi-hop has more fee drag
      expect(multiAmounts[2]).to.be.lt(directAmounts[1]);
    });

    it("should revert with path length < 2", async function () {
      const { router, bob, addrA } = await loadFixture(deployDEXFixture);
      await expect(
        router.connect(bob).swapExactTokensForTokens(
          ethers.parseEther("100"), 0n, [addrA], bob.address, deadline()
        )
      ).to.be.reverted;
    });

    it("should correctly route: A -> B -> C -> A (triangle arbitrage path)", async function () {
      const { router, bob, addrA, addrB, addrC } = await loadFixture(deployDEXFixture);
      const tokenA = await ethers.getContractAt("ArcToken", addrA);
      const amountIn = ethers.parseEther("100");

      const amounts = await router.getAmountsOut(amountIn, [addrA, addrB, addrC, addrA]);
      expect(amounts.length).to.equal(4);

      const balBefore = await tokenA.balanceOf(bob.address);
      await router.connect(bob).swapExactTokensForTokens(
        amountIn, 0n, [addrA, addrB, addrC, addrA], bob.address, deadline()
      );
      const balAfter = await tokenA.balanceOf(bob.address);
      // Net position: started with amountIn, received amounts[3]
      // In a balanced pool, round trip loses money due to fees
      expect(balBefore - balAfter + amounts[3]).to.equal(amountIn);
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 8. Price Queries
  // ───────────────────────────────────────────────────────────────
  describe("Price Queries", function () {
    it("getPrice should return ~2e18 for A/B pool (1A=2B)", async function () {
      const { router, addrA, addrB } = await loadFixture(deployDEXFixture);
      const price = await router.getPrice(addrA, addrB);
      // Price = reserveB/reserveA * 1e18 = 200000/100000 * 1e18 = 2e18
      const expected = ethers.parseEther("2");
      expect(price).to.equal(expected);
    });

    it("getPrice(B,A) should be inverse of getPrice(A,B)", async function () {
      const { router, addrA, addrB } = await loadFixture(deployDEXFixture);
      const priceAB = await router.getPrice(addrA, addrB);
      const priceBA = await router.getPrice(addrB, addrA);

      // priceAB * priceBA / 1e18 ≈ 1e18 (within rounding)
      const product = (priceAB * priceBA) / ethers.parseEther("1");
      const oneEther = ethers.parseEther("1");
      // Allow ±1 wei rounding
      expect(product).to.be.closeTo(oneEther, 1n);
    });

    it("getPrice should revert for non-existent pair", async function () {
      const [owner] = await ethers.getSigners();
      const ArcToken = await ethers.getContractFactory("ArcToken");
      const ArcSwap  = await ethers.getContractFactory("ArcSwap");
      const t1 = await ArcToken.deploy("T1", "T1", owner.address);
      const t2 = await ArcToken.deploy("T2", "T2", owner.address);
      const r  = await ArcSwap.deploy(owner.address);
      await expect(r.getPrice(await t1.getAddress(), await t2.getAddress())).to.be.reverted;
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 9. Liquidity (via router)
  // ───────────────────────────────────────────────────────────────
  describe("Liquidity via Router", function () {
    it("addLiquidity to existing pool should not create new pair", async function () {
      const { router, bob, addrA, addrB } = await loadFixture(deployDEXFixture);
      const pairsBefore = await router.allPairsLength();

      await router.connect(bob).addLiquidity(
        addrA, addrB,
        ethers.parseEther("10000"), ethers.parseEther("20000"),
        0n, 0n,
        bob.address,
        deadline()
      );

      const pairsAfter = await router.allPairsLength();
      expect(pairsAfter).to.equal(pairsBefore);
    });

    it("addLiquidity to new pair should create it automatically", async function () {
      const [owner, alice] = await ethers.getSigners();
      const ArcToken = await ethers.getContractFactory("ArcToken");
      const ArcSwap  = await ethers.getContractFactory("ArcSwap");
      const t1 = await ArcToken.deploy("T1", "T1", owner.address);
      const t2 = await ArcToken.deploy("T2", "T2", owner.address);
      const r  = await ArcSwap.deploy(owner.address);
      const a1 = await t1.getAddress();
      const a2 = await t2.getAddress();
      const ra = await r.getAddress();

      await t1.approve(ra, ethers.MaxUint256);
      await t2.approve(ra, ethers.MaxUint256);

      await r.addLiquidity(a1, a2, ethers.parseEther("1000"), ethers.parseEther("2000"), 0n, 0n, owner.address, deadline());

      expect(await r.allPairsLength()).to.equal(1n);
      expect(await r.getPair(a1, a2)).to.not.equal(ethers.ZeroAddress);
    });
  });
});
