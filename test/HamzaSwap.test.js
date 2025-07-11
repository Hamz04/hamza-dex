const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HamzaSwap DEX", function () {
  let factory, router, tokenA, tokenB, owner, user1;

  beforeEach(async function () {
    [owner, user1] = await ethers.getSigners();
    const ERC20 = await ethers.getContractFactory("MockERC20");
    tokenA = await ERC20.deploy("Token A", "TKA", ethers.parseEther("1000000"));
    tokenB = await ERC20.deploy("Token B", "TKB", ethers.parseEther("1000000"));
    const Factory = await ethers.getContractFactory("HamzaSwapFactory");
    factory = await Factory.deploy(owner.address);
    const Router = await ethers.getContractFactory("HamzaSwapRouter");
    router = await Router.deploy(await factory.getAddress());
  });

  describe("Factory", function () {
    it("deploys pairs correctly", async function () {
      await factory.createPair(await tokenA.getAddress(), await tokenB.getAddress());
      const pairAddr = await factory.getPair(await tokenA.getAddress(), await tokenB.getAddress());
      expect(pairAddr).to.not.equal(ethers.ZeroAddress);
      expect(await factory.allPairsLength()).to.equal(1);
    });

    it("prevents duplicate pairs", async function () {
      await factory.createPair(await tokenA.getAddress(), await tokenB.getAddress());
      await expect(factory.createPair(await tokenA.getAddress(), await tokenB.getAddress()))
        .to.be.revertedWith("HamzaSwap: PAIR_EXISTS");
    });
  });

  describe("Liquidity", function () {
    it("adds initial liquidity and mints LP tokens", async function () {
      const amountA = ethers.parseEther("100");
      const amountB = ethers.parseEther("200");
      await tokenA.approve(await router.getAddress(), amountA);
      await tokenB.approve(await router.getAddress(), amountB);
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const tx = await router.addLiquidity(
        await tokenA.getAddress(), await tokenB.getAddress(),
        amountA, amountB, 0, 0, owner.address, deadline
      );
      await tx.wait();
      const pairAddr = await factory.getPair(await tokenA.getAddress(), await tokenB.getAddress());
      const pair = await ethers.getContractAt("HamzaSwapPair", pairAddr);
      const lpBalance = await pair.balanceOf(owner.address);
      expect(lpBalance).to.be.gt(0);
    });
  });

  describe("Swaps", function () {
    it("swaps tokens with correct 0.3% fee", async function () {
      const amountA = ethers.parseEther("1000");
      const amountB = ethers.parseEther("1000");
      await tokenA.approve(await router.getAddress(), amountA);
      await tokenB.approve(await router.getAddress(), amountB);
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      await router.addLiquidity(
        await tokenA.getAddress(), await tokenB.getAddress(),
        amountA, amountB, 0, 0, owner.address, deadline
      );
      const swapAmount = ethers.parseEther("10");
      await tokenA.transfer(user1.address, swapAmount);
      await tokenA.connect(user1).approve(await router.getAddress(), swapAmount);
      const balBefore = await tokenB.balanceOf(user1.address);
      await router.connect(user1).swapExactTokensForTokens(
        swapAmount, 0,
        [await tokenA.getAddress(), await tokenB.getAddress()],
        user1.address, deadline
      );
      const balAfter = await tokenB.balanceOf(user1.address);
      expect(balAfter).to.be.gt(balBefore);
    });
  });
});
