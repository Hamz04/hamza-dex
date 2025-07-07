const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log("Balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "ETH");

  const Factory = await ethers.getContractFactory("HamzaSwapFactory");
  const factory = await Factory.deploy(deployer.address);
  await factory.waitForDeployment();
  console.log("Factory deployed to:", await factory.getAddress());

  const Router = await ethers.getContractFactory("HamzaSwapRouter");
  const router = await Router.deploy(await factory.getAddress());
  await router.waitForDeployment();
  console.log("Router deployed to:", await router.getAddress());

  console.log("\n--- Deployment Summary ---");
  console.log("Network: Sepolia Testnet");
  console.log("Factory:", await factory.getAddress());
  console.log("Router:", await router.getAddress());
}

main().catch((e) => { console.error(e); process.exit(1); });
