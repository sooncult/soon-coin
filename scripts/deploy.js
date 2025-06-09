// Scripts for deploying the SOON token ecosystem
const hre = require("hardhat");
const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying SOON Token contracts to", network.name, "network...");
  
  // Get the deployer's address
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  // Check if we're on mainnet and warn
  if (network.name === 'mainnet' || network.name === 'rootstock') {
    console.log("\n⚠️  WARNING: Deploying to MAINNET!");
    console.log("Make sure you have reviewed all contracts for production readiness.");
    console.log("Continuing in 5 seconds...\n");
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

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

  // Deploy SushiSwap V3 Factory
  console.log("Deploying SushiSwap V3 Factory...");
  const SushiSwapV3Factory = await hre.ethers.getContractFactory("SushiSwapV3Factory");
  const factory = await SushiSwapV3Factory.deploy();
  await factory.deployed();
  console.log("SushiSwap V3 Factory deployed to:", factory.address);

  // Deploy WETH9
  console.log("Deploying WETH9...");
  const WETH9 = await hre.ethers.getContractFactory("WETH9");
  const weth9 = await WETH9.deploy();
  await weth9.deployed();
  console.log("WETH9 deployed to:", weth9.address);

  // Deploy Nonfungible Position Manager
  console.log("Deploying Nonfungible Position Manager...");
  const NonfungiblePositionManager = await hre.ethers.getContractFactory("NonfungiblePositionManager");
  const positionManager = await NonfungiblePositionManager.deploy(
    factory.address,
    weth9.address,
    deployer.address
  );
  await positionManager.deployed();
  console.log("Nonfungible Position Manager deployed to:", positionManager.address);

  // Create initial liquidity pool
  const tx = await factory.createPool(soon.address, weth9.address, 3000);
  const receipt = await tx.wait();
  const poolAddress = await factory.getPool(soon.address, weth9.address, 3000);
  console.log("Created SOON/WETH pool at:", poolAddress);

  // Deploy LiquidityManager with network awareness
  let liquidityManager;
  if (network.name === 'hardhat' || network.name === 'localhost') {
    // Local testing mode: Use MockLiquidityManager
    console.log("Deploying MockLiquidityManager for testing...");
    const MockLiquidityManager = await hre.ethers.getContractFactory("MockLiquidityManager");
    liquidityManager = await MockLiquidityManager.deploy(
      soon.address,
      weth9.address,
      positionManager.address
    );
    console.log("⚠️  Using MockLiquidityManager - DO NOT USE IN PRODUCTION");
  } else {
    // Production mode: Use real LiquidityManager with real pool oracle
    console.log("Deploying LiquidityManager for production...");
    
    // For mainnet, you should use the actual SushiSwap V3 contracts
    // These addresses are placeholders - replace with actual mainnet addresses
    if (network.name === 'mainnet' || network.name === 'rootstock') {
      console.log("🚨 IMPORTANT: Update the following addresses with actual SushiSwap V3 addresses:");
      console.log("   - Position Manager: Use actual SushiSwap V3 NonfungiblePositionManager");
      console.log("   - Pool Oracle: Use actual SOON/RBTC pool address");
      console.log("   - WETH9: Use actual WRBTC address on Rootstock");
    }
    
    const LiquidityManager = await hre.ethers.getContractFactory("LiquidityManager");
    liquidityManager = await LiquidityManager.deploy(
      soon.address,
      weth9.address,
      positionManager.address,
      poolAddress // Real pool address for TWAP oracle
    );
  }
  await liquidityManager.deployed();
  console.log("LiquidityManager deployed to:", liquidityManager.address);

  // Set LiquidityManager in SOON token
  console.log("Setting LiquidityManager in SOON token...");
  await soon.setLiquidityManager(liquidityManager.address);
  console.log("Transferred SOON token ownership to Liquidity Manager");

  console.log("Deployment completed!");
  
  // Log contract addresses for verification
  console.log("\n==================== Contract Addresses ====================");
  console.log("Network:", network.name);
  console.log("SushiSwap V3 Factory:", factory.address);
  console.log("WETH9:", weth9.address);
  console.log("Nonfungible Position Manager:", positionManager.address);
  console.log("SOON Token:", soon.address);
  console.log("SOON Airdrop:", airdrop.address);
  console.log("Liquidity Manager:", liquidityManager.address);
  console.log("SOON/WETH Pool:", poolAddress);
  console.log("==========================================================");

  if (network.name === 'mainnet' || network.name === 'rootstock') {
    console.log("\n📋 POST-DEPLOYMENT CHECKLIST:");
    console.log("1. Verify all contracts on block explorer");
    console.log("2. Transfer initial SOON and RBTC to LiquidityManager");
    console.log("3. Call initializePosition() on LiquidityManager");
    console.log("4. Lock the LiquidityManager after configuration");
    console.log("5. Renounce ownership if required");
    console.log("6. Update airdrop Merkle root with actual data");
  }

  // Wait for a few block confirmations
  console.log("\nWaiting for block confirmations...");
  console.log("All contracts deployed successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 