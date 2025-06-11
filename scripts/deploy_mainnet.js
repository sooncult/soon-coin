/*
  scripts/deploy_mainnet.js
  ------------------------------------------------------------
  Rootstock MAINNET deployment script for the SOON ecosystem.

  Workflow (Option A):
    1. Deploy SOON token + Airdrop.
    2. Create a SOON/WRBTC SushiSwap V3 pool with seed liquidity
       using the canonical NonfungiblePositionManager.
    3. Retrieve the pool address from the Factory.
    4. Deploy LiquidityManager in production-mode with that pool
       as its TWAP oracle.
    5. Set LiquidityManager as owner/manager in the SOON token.

  CONFIGURATION:
    - Private key: .env.mainnet (PRIVATE_KEY_MAINNET)
    - SushiSwap addresses: config/mainnet.js
    - Deployment settings: config/mainnet.js

  NOTE:  This script sends real txs on Rootstock main-net.
         Make sure the deployer account is funded with RBTC.
*/

require("dotenv").config();
const hre   = require("hardhat");
const { ethers } = hre;

// Load mainnet configuration
const config = require("../config/mainnet");

async function main() {
  if (hre.network.name !== "rootstock") {
    throw new Error("❌ This script must be run on mainnet (--network rootstock)");
  }

  // Validate configuration
  console.log("🔧 Validating mainnet configuration...");
  config.validateAddresses();

  const [deployer] = await ethers.getSigners();
  const initialBalance = await deployer.getBalance();
  
  console.log("\n🚀  MAINNET DEPLOYMENT - SOON Token Ecosystem");
  console.log("=" * 60);
  console.log("📅", new Date().toLocaleString());
  console.log("🌐 Network:", hre.network.name);
  console.log("👤 Deployer:", deployer.address);
  console.log("💰 RBTC balance:", ethers.utils.formatEther(initialBalance));

  // Minimum balance check
  const minBalance = ethers.utils.parseEther("0.2"); // Increased for safety
  if (initialBalance.lt(minBalance)) {
    throw new Error(`❌ Insufficient balance. Need at least 0.2 RBTC, have ${ethers.utils.formatEther(initialBalance)}`);
  }

  console.log("\n📋 Using mainnet configuration:");
  console.log("Factory:", config.SUSHISWAP_V3_FACTORY);
  console.log("PositionManager:", config.SUSHISWAP_V3_POSITION_MANAGER);
  console.log("WRBTC:", config.WRBTC);
  console.log("Fee Tier:", config.DEFAULT_FEE_TIER / 100, "%");

  // Confirm before proceeding
  console.log("\n⚠️  MAINNET DEPLOYMENT WARNING");
  console.log("This will deploy contracts on Rootstock mainnet using REAL RBTC.");
  console.log("Estimated cost: ~0.15 RBTC (gas + seed liquidity)");
  console.log("⏳ Proceeding in 5 seconds...");
  await new Promise(resolve => setTimeout(resolve, 5000));

  // 1. Deploy SOON token
  console.log("\n=== 1. DEPLOYING SOON TOKEN ===");
  const SOON = await ethers.getContractFactory("SOON");
  const soon = await SOON.deploy();
  await soon.deployed();
  console.log("✅ SOON deployed:", soon.address);

  // 2. Deploy Airdrop (30-day window from now)
  console.log("\n=== 2. DEPLOYING AIRDROP ===");
  const SECONDS_30_DAYS = 60 * 60 * 24 * 30;
  const SOONAirdrop = await ethers.getContractFactory("SOONAirdrop");
  const airdrop = await SOONAirdrop.deploy(soon.address, Math.floor(Date.now() / 1000) + SECONDS_30_DAYS);
  await airdrop.deployed();
  console.log("✅ Airdrop deployed:", airdrop.address);

  // 3. Create seed V3 pool with liquidity
  console.log("\n=== 3. CREATING SOON/WRBTC V3 POOL ===");

  const token0 = soon.address.toLowerCase() < config.WRBTC.toLowerCase() ? soon.address : config.WRBTC;
  const token1 = soon.address.toLowerCase() < config.WRBTC.toLowerCase() ? config.WRBTC : soon.address;
  const feeTier = config.DEFAULT_FEE_TIER;
  const tickLower = -60000;        // very wide bootstrap range
  const tickUpper =  60000;

  // Seed amounts from config
  const SEED_SOON = ethers.utils.parseEther(config.SEED_LIQUIDITY.SOON_AMOUNT);
  const SEED_RBTC = ethers.utils.parseEther(config.SEED_LIQUIDITY.RBTC_AMOUNT);

  console.log("💰 Seed amounts:");
  console.log("  SOON:", ethers.utils.formatEther(SEED_SOON));
  console.log("  RBTC:", ethers.utils.formatEther(SEED_RBTC));

  // Wrap RBTC → WRBTC
  const WETH9 = await ethers.getContractAt("WETH9", config.WRBTC);
  console.log("🔄 Wrapping RBTC...");
  await (await WETH9.deposit({ value: SEED_RBTC })).wait();
  await (await WETH9.approve(config.SUSHISWAP_V3_POSITION_MANAGER, SEED_RBTC)).wait();
  console.log("✅ Wrapped", ethers.utils.formatEther(SEED_RBTC), "RBTC → WRBTC");

  // Approve SOON to PositionManager
  await (await soon.approve(config.SUSHISWAP_V3_POSITION_MANAGER, SEED_SOON)).wait();

  // Mint via NonfungiblePositionManager
  const NPM = await ethers.getContractAt("NonfungiblePositionManager", config.SUSHISWAP_V3_POSITION_MANAGER);
  const deadline = Math.floor(Date.now() / 1000) + 600;
  const params = {
    token0,
    token1,
    fee: feeTier,
    tickLower,
    tickUpper,
    amount0Desired: token0 === soon.address ? SEED_SOON : SEED_RBTC,
    amount1Desired: token0 === soon.address ? SEED_RBTC : SEED_SOON,
    amount0Min: 0,
    amount1Min: 0,
    recipient: deployer.address,
    deadline,
  };
  console.log("⏳ Minting seed LP (this creates the pool)...");
  const mintTx = await NPM.mint(params);
  const mintReceipt = await mintTx.wait();
  console.log("✅ Seed position minted (gas:", mintReceipt.gasUsed.toString(), ")");

  // Retrieve pool address
  const Factory = await ethers.getContractAt("SushiSwapV3Factory", config.SUSHISWAP_V3_FACTORY);
  const pool = await Factory.getPool(soon.address, config.WRBTC, feeTier);
  if (pool === ethers.constants.AddressZero) throw new Error("Pool creation failed");
  console.log("✅ SOON/WRBTC pool:", pool);

  // 4. Deploy LiquidityManager (production-mode)
  console.log("\n=== 4. DEPLOYING LIQUIDITY MANAGER ===");
  const LiquidityManager = await ethers.getContractFactory("LiquidityManager");
  const lm = await LiquidityManager.deploy(soon.address, config.WRBTC, config.SUSHISWAP_V3_POSITION_MANAGER, pool);
  await lm.deployed();
  console.log("✅ LiquidityManager deployed:", lm.address);

  // 5. Make LiquidityManager the token owner/manager
  console.log("\n=== 5. SETTING LIQUIDITY MANAGER AS OWNER ===");
  await (await soon.setLiquidityManager(lm.address)).wait();
  console.log("✅ LiquidityManager linked & now owns SOON token");

  // Calculate gas costs
  const finalBalance = await deployer.getBalance();
  const gasUsed = initialBalance.sub(finalBalance);

  // Summary
  console.log("\n🎉  MAINNET DEPLOYMENT COMPLETE");
  console.log("=" * 60);
  console.log("SOON Token:", soon.address);
  console.log("Airdrop:", airdrop.address);
  console.log("Pool:", pool);
  console.log("LiquidityManager:", lm.address);
  console.log("=" * 60);
  console.log("⛽ Total cost:", ethers.utils.formatEther(gasUsed), "RBTC");
  console.log("💰 Remaining balance:", ethers.utils.formatEther(finalBalance), "RBTC");
  
  // Save deployment addresses for later use
  const deploymentInfo = {
    network: "rootstock",
    deployedAt: new Date().toISOString(),
    addresses: {
      soonToken: soon.address,
      airdrop: airdrop.address,
      pool: pool,
      liquidityManager: lm.address,
      factory: config.SUSHISWAP_V3_FACTORY,
      positionManager: config.SUSHISWAP_V3_POSITION_MANAGER,
      wrbtc: config.WRBTC
    },
    deployment: {
      deployer: deployer.address,
      gasUsed: ethers.utils.formatEther(gasUsed),
      seedLiquidity: {
        soon: ethers.utils.formatEther(SEED_SOON),
        rbtc: ethers.utils.formatEther(SEED_RBTC)
      }
    }
  };

  console.log("\n📋 NEXT STEPS:");
  console.log("1. Update test files with these addresses:");
  console.log(`   soonToken: "${soon.address}"`);
  console.log(`   airdrop: "${airdrop.address}"`);
  console.log(`   liquidityManager: "${lm.address}"`);
  console.log(`   pool: "${pool}"`);
  console.log("2. Run validation: npx hardhat run scripts/test_mainnet_readonly.js --network rootstock");
  console.log("3. Run full test: npx hardhat run scripts/test_mainnet_tx.js --network rootstock");
  
  console.log("\n💾 Deployment info saved to console (copy to safe place)");
  console.log(JSON.stringify(deploymentInfo, null, 2));
}

main().catch((err) => {
  console.error("\n❌ MAINNET DEPLOYMENT FAILED");
  console.error(err);
  process.exit(1);
}); 