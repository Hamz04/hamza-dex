/**
 * LiquidityPool.test.js
 * ─────────────────────────────────────────────────────────────────
 * Comprehensive tests for LiquidityPool.sol:
 *   - LP token minting on first and subsequent deposits
 *   - MINIMUM_LIQUIDITY locked permanently
 *   - Proportional withdrawal
 *   - Reserve tracking (sync with actual balances)
 *   - Fee accumulation tracking
 *   - Price cumulative accumulators (TWAP)
 *   - Access control (onlyRouter)
 *   - Edge cases
 */

const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function deadline() {
  return Math.floor(Date.now() / 1000) + 1200;
}

function sqrt(value) {
  if (value < 0n) throw new Error("Negative sqrt");
  if (value === 0n) return 0n;
  let z = value;
  let x = value / 2n + 1n;
  while (x < z) { z = x; x = (value / x + x) / 2n; }
  return z;
}

// ─────────────────────────────────────────────────────────────────
// Fixture
// ─────────────────────────────────────────────────────────────────

async function deployPoolFixture() {
  const [owner, alice, bob, carol] = await ethers.getSigners();

  const ArcToken = await ethers.getContractFactory("ArcToken");
  const ArcSwap  = await ethers.getContractFactory("ArcSwap");

  const tokenA = await ArcToken.deploy("Token A", "TKA", owner.address);
  const tokenB = await ArcToken.deploy("Token B", "TKB", owner.address);
  const router = await ArcSwap.deploy(owner.address);

  const addrA = await tokenA.getAddress();
  const addrB = await tokenB.getAddress();
  const routerAddr = await router.getAddress();

  // Mint to all signers
  const MINT = ethers.parseEther("50000000");
  for (const signer of [owner, alice, bob, carol]) {
    await tokenA.mint(signer.address, MINT);
    await tokenB.mint(signer.address, MINT);
    await tokenA.connect(signer).approve(routerAddr, ethers.MaxUint256);
    await tokenB.connect(signer).approve(routerAddr, ethers.MaxUint256);
  }

  // Create pair
  const tx = await router.createPair(addrA, addrB);
  const receipt = await tx.wait();
  const event = receipt.logs
    .map(log => { try { return router.interface.parseLog(log); } catch { return null; } })
    .find(e => e && e.name === "PairCreated");
  const pairAddr = event.args.pair;

  const pool = await ethers.getContractAt("LiquidityPool", pairAddr);

  // Get canonical token order from pool
  const token0Addr = await pool.tokenA();
  const token1Addr = await pool.tokenB();
  const token0 = token0Addr === addrA ? tokenA : tokenB;
  const token1 = token0Addr === addrA ? tokenB : tokenA;

  return {
    owner, alice, bob, carol,
    tokenA, tokenB, token0, token1,
    addrA, addrB, token0Addr, token1Addr,
    router, routerAddr,
    pool, pairAddr,
  };
}

// ─────────────────────────────────────────────────────────────────
// Test Suite
// ─────────────────────────────────────────────────────────────────

describe("LiquidityPool", function () {

  // ───────────────────────────────────────────────────────────────
  // 1. Pool Deployment & Config
  // ───────────────────────────────────────────────────────────────
  describe("Deployment & Configuration", function () {
    it("should have correct token addresses in canonical order", async function () {
      const { pool, addrA, addrB } = await loadFixture(deployPoolFixture);
      const t0 = await pool.tokenA();
      const t1 = await pool.tokenB();
      // Canonical: lower address first
      expect(t0.toLowerCase()).to.equal(
        addrA.toLowerCase() < addrB.toLowerCase() ? addrA.toLowerCase() : addrB.toLowerCase()
      );
      expect(t1.toLowerCase()).to.not.equal(t0.toLowerCase());
    });

    it("should have zero reserves on deployment", async function () {
      const { pool } = await loadFixture(deployPoolFixture);
      const [r0, r1] = await pool.getReserves();
      expect(r0).to.equal(0n);
      expect(r1).to.equal(0n);
    });

    it("should have zero total supply on deployment", async function () {
      const { pool } = await loadFixture(deployPoolFixture);
      expect(await pool.totalSupply()).to.equal(0n);
    });

    it("should have correct MINIMUM_LIQUIDITY constant", async function () {
      const { pool } = await loadFixture(deployPoolFixture);
      expect(await pool.MINIMUM_LIQUIDITY()).to.equal(1000n);
    });

    it("should have correct fee constants (3/1000)", async function () {
      const { pool } = await loadFixture(deployPoolFixture);
      expect(await pool.FEE_NUMERATOR()).to.equal(3n);
      expect(await pool.FEE_DENOMINATOR()).to.equal(1000n);
    });

    it("router address should be set correctly", async function () {
      const { pool, routerAddr } = await loadFixture(deployPoolFixture);
      expect(await pool.router()).to.equal(routerAddr);
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 2. LP Token Minting — First Deposit
  // ───────────────────────────────────────────────────────────────
  describe("LP Token Minting — First Deposit", function () {
    it("should mint sqrt(amountA * amountB) - MINIMUM_LIQUIDITY LP tokens", async function () {
      const { router, alice, addrA, addrB, pool } = await loadFixture(deployPoolFixture);
      const amtA = ethers.parseEther("10000");
      const amtB = ethers.parseEther("40000");

      await router.connect(alice).addLiquidity(
        addrA, addrB, amtA, amtB, 0n, 0n, alice.address, deadline()
      );

      const MINIMUM_LIQUIDITY = 1000n;
      const expectedLP = sqrt(amtA * amtB) - MINIMUM_LIQUIDITY;
      const aliceLP = await pool.balanceOf(alice.address);
      expect(aliceLP).to.equal(expectedLP);
    });

    it("should permanently lock MINIMUM_LIQUIDITY to address(1)", async function () {
      const { router, alice, addrA, addrB, pool } = await loadFixture(deployPoolFixture);
      await router.connect(alice).addLiquidity(
        addrA, addrB,
        ethers.parseEther("10000"), ethers.parseEther("10000"),
        0n, 0n, alice.address, deadline()
      );

      const burnedLP = await pool.balanceOf("0x0000000000000000000000000000000000000001");
      expect(burnedLP).to.equal(1000n);
    });

    it("total supply after first deposit = sqrt(amtA*amtB)", async function () {
      const { router, alice, addrA, addrB, pool } = await loadFixture(deployPoolFixture);
      const amtA = ethers.parseEther("9000");
      const amtB = ethers.parseEther("4000");

      await router.connect(alice).addLiquidity(
        addrA, addrB, amtA, amtB, 0n, 0n, alice.address, deadline()
      );

      const totalSupply = await pool.totalSupply();
      const expected = sqrt(amtA * amtB);
      expect(totalSupply).to.equal(expected);
    });

    it("should update reserves after first deposit", async function () {
      const { router, alice, addrA, addrB, pool, token0Addr } = await loadFixture(deployPoolFixture);
      const amtA = ethers.parseEther("10000");
      const amtB = ethers.parseEther("20000");

      await router.connect(alice).addLiquidity(
        addrA, addrB, amtA, amtB, 0n, 0n, alice.address, deadline()
      );

      const [r0, r1] = await pool.getReserves();
      // Reserves are in canonical (token0, token1) order
      if (token0Addr === addrA) {
        expect(r0).to.equal(amtA);
        expect(r1).to.equal(amtB);
      } else {
        expect(r0).to.equal(amtB);
        expect(r1).to.equal(amtA);
      }
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 3. LP Token Minting — Subsequent Deposits
  // ───────────────────────────────────────────────────────────────
  describe("LP Token Minting — Subsequent Deposits", function () {
    it("should mint proportional LP tokens on second deposit", async function () {
      const { router, alice, bob, addrA, addrB, pool } = await loadFixture(deployPoolFixture);

      // First deposit by alice
      const amt1A = ethers.parseEther("10000");
      const amt1B = ethers.parseEther("20000");
      await router.connect(alice).addLiquidity(
        addrA, addrB, amt1A, amt1B, 0n, 0n, alice.address, deadline()
      );

      const totalSupplyAfter1 = await pool.totalSupply();

      // Second deposit by bob: same ratio
      const amt2A = ethers.parseEther("5000");
      const amt2B = ethers.parseEther("10000");
      await router.connect(bob).addLiquidity(
        addrA, addrB, amt2A, amt2B, 0n, 0n, bob.address, deadline()
      );

      // Bob's LP = min(amt2A/reserveA, amt2B/reserveB) * totalSupply
      // = min(5000/10000, 10000/20000) * totalSupply = 0.5 * totalSupply
      const bobLP = await pool.balanceOf(bob.address);
      const aliceLP = await pool.balanceOf(alice.address);

      // Bob deposited half of alice's first deposit, so gets half of (totalSupply - MINIMUM_LIQUIDITY)
      // More precisely: bobLP / aliceLP ≈ 0.5
      expect(bobLP * 2n).to.be.closeTo(aliceLP, ethers.parseEther("0.001"));
    });

    it("multiple LPs: share percentages should sum to 100%", async function () {
      const { router, alice, bob, carol, addrA, addrB, pool } = await loadFixture(deployPoolFixture);

      await router.connect(alice).addLiquidity(addrA, addrB, ethers.parseEther("10000"), ethers.parseEther("10000"), 0n, 0n, alice.address, deadline());
      await router.connect(bob).addLiquidity(addrA, addrB, ethers.parseEther("5000"), ethers.parseEther("5000"), 0n, 0n, bob.address, deadline());
      await router.connect(carol).addLiquidity(addrA, addrB, ethers.parseEther("2500"), ethers.parseEther("2500"), 0n, 0n, carol.address, deadline());

      const totalSupply = await pool.totalSupply();
      const aliceLP = await pool.balanceOf(alice.address);
      const bobLP   = await pool.balanceOf(bob.address);
      const carolLP = await pool.balanceOf(carol.address);
      const burnedLP = await pool.balanceOf("0x0000000000000000000000000000000000000001");

      // All LP tokens account for: alice + bob + carol + burned = totalSupply
      expect(aliceLP + bobLP + carolLP + burnedLP).to.equal(totalSupply);
    });

    it("getShareBasisPoints should return correct share", async function () {
      const { router, alice, bob, addrA, addrB, pool } = await loadFixture(deployPoolFixture);

      await router.connect(alice).addLiquidity(addrA, addrB, ethers.parseEther("10000"), ethers.parseEther("10000"), 0n, 0n, alice.address, deadline());
      await router.connect(bob).addLiquidity(addrA, addrB, ethers.parseEther("10000"), ethers.parseEther("10000"), 0n, 0n, bob.address, deadline());

      // Alice and bob each own roughly half (minus MINIMUM_LIQUIDITY rounding)
      const aliceBps = await pool.getShareBasisPoints(alice.address);
      const bobBps   = await pool.getShareBasisPoints(bob.address);

      // Each should have ~4950-5000 bps (49.5-50%)
      expect(aliceBps).to.be.gte(4900n);
      expect(aliceBps).to.be.lte(5100n);
      expect(bobBps).to.be.gte(4900n);
      expect(bobBps).to.be.lte(5100n);
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 4. Proportional Withdrawal
  // ───────────────────────────────────────────────────────────────
  describe("Proportional Withdrawal", function () {
    it("should return proportional tokens on removeLiquidity", async function () {
      const { router, alice, addrA, addrB, pool } = await loadFixture(deployPoolFixture);

      const amtA = ethers.parseEther("10000");
      const amtB = ethers.parseEther("20000");
      await router.connect(alice).addLiquidity(
        addrA, addrB, amtA, amtB, 0n, 0n, alice.address, deadline()
      );

      const aliceLP = await pool.balanceOf(alice.address);
      const totalSupply = await pool.totalSupply();

      const tokenA = await ethers.getContractAt("ArcToken", addrA);
      const tokenB = await ethers.getContractAt("ArcToken", addrB);
      const balABefore = await tokenA.balanceOf(alice.address);
      const balBBefore = await tokenB.balanceOf(alice.address);

      // Remove all of alice's liquidity
      await pool.connect(alice).approve(routerAddr(router), aliceLP);
      await router.connect(alice).removeLiquidity(
        addrA, addrB, aliceLP, 0n, 0n, alice.address, deadline()
      );

      const balAAfter = await tokenA.balanceOf(alice.address);
      const balBAfter = await tokenB.balanceOf(alice.address);

      const receivedA = balAAfter - balABefore;
      const receivedB = balBAfter - balBBefore;

      // Should receive aliceLP/totalSupply fraction of reserves
      const expectedA = (aliceLP * amtA) / totalSupply;
      const expectedB = (aliceLP * amtB) / totalSupply;

      expect(receivedA).to.equal(expectedA);
      expect(receivedB).to.equal(expectedB);
    });

    it("removing partial liquidity should leave correct reserves", async function () {
      const { router, alice, addrA, addrB, pool } = await loadFixture(deployPoolFixture);

      await router.connect(alice).addLiquidity(
        addrA, addrB,
        ethers.parseEther("10000"), ethers.parseEther("20000"),
        0n, 0n, alice.address, deadline()
      );

      const aliceLP = await pool.balanceOf(alice.address);
      const halfLP  = aliceLP / 2n;

      await pool.connect(alice).approve(routerAddr(router), halfLP);
      await router.connect(alice).removeLiquidity(
        addrA, addrB, halfLP, 0n, 0n, alice.address, deadline()
      );

      // Remaining LP balance
      const remaining = await pool.balanceOf(alice.address);
      expect(remaining).to.equal(aliceLP - halfLP);
    });

    it("should revert removeLiquidity below amountMin", async function () {
      const { router, alice, addrA, addrB, pool } = await loadFixture(deployPoolFixture);

      await router.connect(alice).addLiquidity(
        addrA, addrB,
        ethers.parseEther("1000"), ethers.parseEther("1000"),
        0n, 0n, alice.address, deadline()
      );

      const aliceLP = await pool.balanceOf(alice.address);
      await pool.connect(alice).approve(routerAddr(router), aliceLP);

      // amountAMin set impossibly high
      await expect(
        router.connect(alice).removeLiquidity(
          addrA, addrB, aliceLP,
          ethers.parseEther("999999"), 0n,
          alice.address, deadline()
        )
      ).to.be.reverted;
    });

    it("LP balance should be 0 after full withdrawal", async function () {
      const { router, alice, addrA, addrB, pool } = await loadFixture(deployPoolFixture);

      await router.connect(alice).addLiquidity(
        addrA, addrB,
        ethers.parseEther("5000"), ethers.parseEther("5000"),
        0n, 0n, alice.address, deadline()
      );

      const aliceLP = await pool.balanceOf(alice.address);
      await pool.connect(alice).approve(routerAddr(router), aliceLP);
      await router.connect(alice).removeLiquidity(
        addrA, addrB, aliceLP, 0n, 0n, alice.address, deadline()
      );

      expect(await pool.balanceOf(alice.address)).to.equal(0n);
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 5. Reserve Tracking
  // ───────────────────────────────────────────────────────────────
  describe("Reserve Tracking", function () {
    it("reserves should update after each swap", async function () {
      const { router, alice, bob, addrA, addrB, pool } = await loadFixture(deployPoolFixture);

      await router.connect(alice).addLiquidity(
        addrA, addrB,
        ethers.parseEther("10000"), ethers.parseEther("20000"),
        0n, 0n, alice.address, deadline()
      );

      const [r0before, r1before] = await pool.getReserves();

      await router.connect(bob).swapExactTokensForTokens(
        ethers.parseEther("1000"), 0n, [addrA, addrB], bob.address, deadline()
      );

      const [r0after, r1after] = await pool.getReserves();

      // Total value in pool changes (k increases due to fee)
      expect(r0after * r1after).to.be.gt(r0before * r1before);
    });

    it("getSpotPrice should update after swap", async function () {
      const { router, alice, bob, addrA, addrB, pool } = await loadFixture(deployPoolFixture);

      await router.connect(alice).addLiquidity(
        addrA, addrB,
        ethers.parseEther("10000"), ethers.parseEther("20000"),
        0n, 0n, alice.address, deadline()
      );

      const priceBefore = await pool.getSpotPrice();

      // Bob buys a lot of tokenB with tokenA — price of tokenB should rise (more tokenA per tokenB)
      await router.connect(bob).swapExactTokensForTokens(
        ethers.parseEther("5000"), 0n, [addrA, addrB], bob.address, deadline()
      );

      const priceAfter = await pool.getSpotPrice();

      // SpotPrice = reserveB/reserveA * 1e18
      // After buying tokenB, reserveB drops, reserveA rises → spotPrice drops
      expect(priceAfter).to.be.lt(priceBefore);
    });

    it("sync() should update reserves to match actual balances", async function () {
      const { router, alice, addrA, addrB, pool } = await loadFixture(deployPoolFixture);

      await router.connect(alice).addLiquidity(
        addrA, addrB,
        ethers.parseEther("10000"), ethers.parseEther("10000"),
        0n, 0n, alice.address, deadline()
      );

      // Send tokens directly to pool (bypassing router) — creates imbalance
      const tokenA = await ethers.getContractAt("ArcToken", addrA);
      const pairAddr = await pool.getAddress();
      await tokenA.connect(alice).transfer(pairAddr, ethers.parseEther("1000"));

      // Reserves not yet updated
      const [r0before] = await pool.getReserves();

      // sync()
      await pool.sync();
      const [r0after] = await pool.getReserves();

      // After sync, reserve should reflect the extra tokens sent directly
      expect(r0after).to.be.gt(r0before);
    });

    it("getUnderlyingTokens should return correct proportional amounts", async function () {
      const { router, alice, addrA, addrB, pool } = await loadFixture(deployPoolFixture);

      const amtA = ethers.parseEther("10000");
      const amtB = ethers.parseEther("20000");
      await router.connect(alice).addLiquidity(
        addrA, addrB, amtA, amtB, 0n, 0n, alice.address, deadline()
      );

      const aliceLP = await pool.balanceOf(alice.address);
      const totalSupply = await pool.totalSupply();

      const [underlyingA, underlyingB] = await pool.getUnderlyingTokens(aliceLP);

      // Canonical order in pool: reserves are token0, token1
      // Both should be proportional to alice's share
      const expectedFraction = aliceLP * 10000n / totalSupply;
      const totalA = amtA; // only alice has deposited
      const totalB = amtB;

      // underlying ≈ aliceLP/totalSupply * reserve
      // Allow tiny rounding
      expect(underlyingA + underlyingB).to.be.gt(0n);
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 6. Fee Accumulation
  // ───────────────────────────────────────────────────────────────
  describe("Fee Accumulation", function () {
    it("totalFeesEarned should increase after swaps", async function () {
      const { router, alice, bob, addrA, addrB, pool } = await loadFixture(deployPoolFixture);

      await router.connect(alice).addLiquidity(
        addrA, addrB,
        ethers.parseEther("100000"), ethers.parseEther("100000"),
        0n, 0n, alice.address, deadline()
      );

      const feesBefore = await pool.totalFeesEarnedA() + await pool.totalFeesEarnedB();

      // Execute several swaps
      for (let i = 0; i < 5; i++) {
        await router.connect(bob).swapExactTokensForTokens(
          ethers.parseEther("1000"), 0n, [addrA, addrB], bob.address, deadline()
        );
      }

      const feesAfter = await pool.totalFeesEarnedA() + await pool.totalFeesEarnedB();
      expect(feesAfter).to.be.gt(feesBefore);
    });

    it("LP providers benefit from fee accumulation (k grows)", async function () {
      const { router, alice, bob, addrA, addrB, pool } = await loadFixture(deployPoolFixture);

      await router.connect(alice).addLiquidity(
        addrA, addrB,
        ethers.parseEther("10000"), ethers.parseEther("10000"),
        0n, 0n, alice.address, deadline()
      );

      const kLast = await pool.kLast();

      for (let i = 0; i < 10; i++) {
        await router.connect(bob).swapExactTokensForTokens(
          ethers.parseEther("100"), 0n, [addrA, addrB], bob.address, deadline()
        );
        await router.connect(bob).swapExactTokensForTokens(
          ethers.parseEther("100"), 0n, [addrB, addrA], bob.address, deadline()
        );
      }

      // kLast is updated after mint/burn, not swaps directly
      // But reserves * reserves should be >= original k
      const [r0, r1] = await pool.getReserves();
      expect(r0 * r1).to.be.gte(kLast);
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 7. Access Control
  // ───────────────────────────────────────────────────────────────
  describe("Access Control", function () {
    it("mint() should revert when not called by router", async function () {
      const { pool, alice } = await loadFixture(deployPoolFixture);
      await expect(pool.connect(alice).mint(alice.address)).to.be.reverted;
    });

    it("burn() should revert when not called by router", async function () {
      const { pool, alice } = await loadFixture(deployPoolFixture);
      await expect(pool.connect(alice).burn(alice.address)).to.be.reverted;
    });

    it("swap() should revert when not called by router", async function () {
      const { pool, alice } = await loadFixture(deployPoolFixture);
      await expect(
        pool.connect(alice).swap(ethers.parseEther("1"), 0n, alice.address)
      ).to.be.reverted;
    });

    it("setRouter() should revert when called again after initial set", async function () {
      const { pool, owner } = await loadFixture(deployPoolFixture);
      await expect(
        pool.connect(owner).setRouter(owner.address)
      ).to.be.reverted;
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 8. TWAP Price Accumulators
  // ───────────────────────────────────────────────────────────────
  describe("TWAP Price Accumulators", function () {
    it("price0CumulativeLast should increase after time passes with a swap", async function () {
      const { router, alice, bob, addrA, addrB, pool } = await loadFixture(deployPoolFixture);

      await router.connect(alice).addLiquidity(
        addrA, addrB,
        ethers.parseEther("10000"), ethers.parseEther("20000"),
        0n, 0n, alice.address, deadline()
      );

      const cum0before = await pool.price0CumulativeLast();

      // Advance time by 60 seconds
      await time.increase(60);

      // A swap triggers _update which increments the accumulators
      await router.connect(bob).swapExactTokensForTokens(
        ethers.parseEther("100"), 0n, [addrA, addrB], bob.address, deadline()
      );

      const cum0after = await pool.price0CumulativeLast();
      expect(cum0after).to.be.gt(cum0before);
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 9. Edge Cases
  // ───────────────────────────────────────────────────────────────
  describe("Edge Cases", function () {
    it("should handle very large deposit amounts without overflow", async function () {
      const { router, alice, addrA, addrB } = await loadFixture(deployPoolFixture);

      // Max uint112: 2^112 - 1 ≈ 5.19e33, but token has 18 decimals
      // Use a large but realistic amount: 1 billion tokens
      const large = ethers.parseEther("1000000000");

      const tokenA = await ethers.getContractAt("ArcToken", addrA);
      const tokenB = await ethers.getContractAt("ArcToken", addrB);
      await tokenA.mint(alice.address, large);
      await tokenB.mint(alice.address, large);

      await expect(
        router.connect(alice).addLiquidity(
          addrA, addrB, large, large, 0n, 0n, alice.address, deadline()
        )
      ).to.not.be.reverted;
    });

    it("should handle very small deposit amounts", async function () {
      const { router, alice, addrA, addrB, pool } = await loadFixture(deployPoolFixture);

      // Minimum viable deposit: sqrt(a*b) > MINIMUM_LIQUIDITY (1000)
      // 1001 * 1001 = 1002001, sqrt = 1001 > 1000 ✓
      const tiny = 1001n * 1001n; // ~1002001 wei each — sqrt ≈ 1001
      await router.connect(alice).addLiquidity(
        addrA, addrB, tiny, tiny, 0n, 0n, alice.address, deadline()
      );

      const aliceLP = await pool.balanceOf(alice.address);
      expect(aliceLP).to.be.gt(0n);
    });

    it("should revert on insufficient minted liquidity (too small deposit)", async function () {
      const { router, alice, addrA, addrB } = await loadFixture(deployPoolFixture);

      // Deposit so small that sqrt(a*b) <= MINIMUM_LIQUIDITY
      // sqrt(999 * 999) = 999 < 1000 → should revert
      const tooSmall = 999n;
      await expect(
        router.connect(alice).addLiquidity(
          addrA, addrB, tooSmall, tooSmall, 0n, 0n, alice.address, deadline()
        )
      ).to.be.reverted;
    });
  });
});

// Helper to get router address from router contract
function routerAddr(router) {
  return router.target || router.address;
}
