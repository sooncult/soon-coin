// Scripts for deploying the SOON token ecosystem
const hre = require("hardhat");

async function main() {
  console.log("Deploying SOON Token contracts to Rootstock Testnet...");
  
  // Get the deployer's address
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  // Deploy SOON Token
  console.log("Deploying SOON Token...");
  const SOON = await hre.ethers.getContractFactory("SOON");
  const soon = await SOON.deploy();
  await soon.deployed();
  console.log("SOON Token deployed to:", soon.address);

  // Deploy SOONAirdrop
  console.log("Deploying SOONAirdrop...");
  const SOONAirdrop = await hre.ethers.getContractFactory("SOONAirdrop");
  // For testing, we'll use a dummy Merkle root and 30 days claim period
  const dummyMerkleRoot = "0x0000000000000000000000000000000000000000000000000000000000000000";
  const claimPeriodDays = 30;
  const airdrop = await SOONAirdrop.deploy(
    dummyMerkleRoot,
    soon.address,
    claimPeriodDays
  );
  await airdrop.deployed();
  console.log("SOONAirdrop deployed to:", airdrop.address);

  // Deploy LiquidityManager
  console.log("Deploying LiquidityManager...");
  const LiquidityManager = await hre.ethers.getContractFactory("LiquidityManager");
  
  // Rootstock Testnet addresses
  const positionManager = "0x9Cb1f0B7B2cB0B0E0B0B0B0B0B0B0B0B0B0B0B0"; // Replace with actual SushiSwap V3 Position Manager address
  const poolAddress = "0x8Cb1f0B7B2cB0B0E0B0B0B0B0B0B0B0B0B0B0B0"; // Replace with actual SOON/RBTC pool address
  const wbtcAddress = "0x542fDA317318eBF1d3DEAf76E0b632741A7e677d"; // Rootstock Testnet WRBTC address
  
  const liquidityManager = await LiquidityManager.deploy(
    positionManager,
    poolAddress,
    soon.address,
    wbtcAddress,
    2000,    // Initial tick distance
    1800     // Initial TWAP interval (30 minutes)
  );
  await liquidityManager.deployed();
  console.log("LiquidityManager deployed to:", liquidityManager.address);

  // Set LiquidityManager in SOON token
  console.log("Setting LiquidityManager in SOON token...");
  await soon.setLiquidityManager(liquidityManager.address);
  console.log("LiquidityManager set in SOON token");

  console.log("Deployment completed!");
  
  // Log contract addresses for verification
  console.log("\nContract Addresses:");
  console.log("SOON Token:", soon.address);
  console.log("SOONAirdrop:", airdrop.address);
  console.log("LiquidityManager:", liquidityManager.address);

  // Wait for a few block confirmations
  console.log("\nWaiting for block confirmations...");
  await hre.network.provider.waitForTransaction(soon.deployTransaction.hash, 5);
  await hre.network.provider.waitForTransaction(airdrop.deployTransaction.hash, 5);
  await hre.network.provider.waitForTransaction(liquidityManager.deployTransaction.hash, 5);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 