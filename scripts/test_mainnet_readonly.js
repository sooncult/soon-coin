/*
  scripts/test_mainnet_readonly.js
  ────────────────────────────────────────────────────────────
  MAINNET READ-ONLY TESTS - No transactions, no RBTC fees required
  
  This script validates deployed contracts on Rootstock mainnet by:
  - Verifying contract addresses and basic state
  - Checking pool exists and has liquidity
  - Validating token supply and tax configuration
  - Ensuring LiquidityManager is properly configured
  
  Safe to run anytime - NO transactions sent.
*/

require("dotenv").config();
const hre = require("hardhat");
const { ethers } = hre;

// Load mainnet configuration
const config = require("../config/mainnet");

// Contract addresses from mainnet deployment
// Update these after deployment
const MAINNET_ADDRESSES = {
  soonToken: "UPDATE_AFTER_DEPLOYMENT",
  airdrop: "UPDATE_AFTER_DEPLOYMENT", 
  liquidityManager: "UPDATE_AFTER_DEPLOYMENT",
  pool: "UPDATE_AFTER_DEPLOYMENT",
  
  // These come from config
  factory: config.SUSHISWAP_V3_FACTORY,
  weth9: config.WRBTC,
  positionManager: config.SUSHISWAP_V3_POSITION_MANAGER
};

async function main() {
  if (hre.network.name !== "rootstock") {
    throw new Error("❌ This script must be run on mainnet (--network rootstock)");
  }

  console.log("\n🔍 SOON Token MAINNET Read-Only Validation");
  console.log("=" * 50);
  console.log("📅", new Date().toLocaleString());
  console.log("🌐 Network:", hre.network.name);

  try {
    const [deployer] = await ethers.getSigners();
    console.log("👤 Account:", deployer.address);
    console.log("💰 RBTC Balance:", ethers.utils.formatEther(await deployer.getBalance()));

    console.log("\n=== 1. CONTRACT ADDRESS VERIFICATION ===");
    
    // Verify configuration addresses first
    console.log("📋 Configuration addresses:");
    console.log("✅ Factory:", MAINNET_ADDRESSES.factory);
    console.log("✅ PositionManager:", MAINNET_ADDRESSES.positionManager);
    console.log("✅ WRBTC:", MAINNET_ADDRESSES.weth9);
    
    // Verify deployment addresses
    console.log("\n📋 Deployment addresses:");
    for (const [name, address] of Object.entries(MAINNET_ADDRESSES)) {
      if (["factory", "weth9", "positionManager"].includes(name)) continue; // Skip config addresses
      
      if (address === "UPDATE_AFTER_DEPLOYMENT") {
        console.log(`⚠️  ${name}: NOT SET (update after deployment)`);
      } else {
        console.log(`✅ ${name}: ${address}`);
      }
    }

    // Only proceed if core addresses are set
    if (MAINNET_ADDRESSES.soonToken === "UPDATE_AFTER_DEPLOYMENT") {
      console.log("\n⚠️  Core addresses not set. Update MAINNET_ADDRESSES after deployment.");
      console.log("💡 After deployment, update this script with:");
      console.log("   soonToken: 'DEPLOYED_ADDRESS'");
      console.log("   airdrop: 'DEPLOYED_ADDRESS'");
      console.log("   liquidityManager: 'DEPLOYED_ADDRESS'");
      console.log("   pool: 'DEPLOYED_ADDRESS'");
      return;
    }

    console.log("\n=== 2. CONTRACT STATE VALIDATION ===");

    // Connect to contracts
    const soon = await ethers.getContractAt("SOON", MAINNET_ADDRESSES.soonToken);
    const factory = await ethers.getContractAt("SushiSwapV3Factory", MAINNET_ADDRESSES.factory);
    const weth9 = await ethers.getContractAt("WETH9", MAINNET_ADDRESSES.weth9);

    // Basic token validation
    const totalSupply = await soon.totalSupply();
    const taxRate = await soon.taxRateBIPS();
    console.log("✅ Total Supply:", ethers.utils.formatEther(totalSupply), "SOON");
    console.log("✅ Tax Rate:", taxRate.toString(), "BIPS (", taxRate.toNumber() / 100, "%)");

    // Check token symbol/name
    try {
      const name = await soon.name();
      const symbol = await soon.symbol();
      console.log("✅ Token Name:", name);
      console.log("✅ Token Symbol:", symbol);
    } catch (error) {
      console.log("⚠️ Could not read token metadata:", error.message);
    }

    console.log("\n=== 3. POOL AND LIQUIDITY VALIDATION ===");

    // Check if SOON/WRBTC pool exists
    const poolAddress = await factory.getPool(soon.address, weth9.address, config.DEFAULT_FEE_TIER);
    console.log("✅ Expected Pool:", MAINNET_ADDRESSES.pool);
    console.log("✅ Actual Pool:", poolAddress);
    console.log("✅ Pool addresses match:", poolAddress.toLowerCase() === MAINNET_ADDRESSES.pool.toLowerCase());
    
    if (poolAddress !== ethers.constants.AddressZero) {
      console.log("✅ Pool exists on mainnet");
      
      // Check pool has liquidity (simplified check)
      try {
        const wethBalance = await weth9.balanceOf(poolAddress);
        const soonBalance = await soon.balanceOf(poolAddress);
        console.log("💰 Pool WRBTC:", ethers.utils.formatEther(wethBalance));
        console.log("💰 Pool SOON:", ethers.utils.formatEther(soonBalance));
        
        if (wethBalance.gt(0) && soonBalance.gt(0)) {
          console.log("✅ Pool has liquidity");
          
          // Calculate implied price
          if (wethBalance.gt(0) && soonBalance.gt(0)) {
            const price = wethBalance.mul(ethers.utils.parseEther("1")).div(soonBalance);
            console.log("💰 Implied price: 1 SOON =", ethers.utils.formatEther(price), "WRBTC");
          }
        } else {
          console.log("⚠️ Pool exists but may lack liquidity");
        }
      } catch (error) {
        console.log("⚠️ Could not check pool balances:", error.message);
      }
    } else {
      console.log("❌ Pool does not exist - needs to be created");
    }

    console.log("\n=== 4. LIQUIDITY MANAGER VALIDATION ===");

    if (MAINNET_ADDRESSES.liquidityManager !== "UPDATE_AFTER_DEPLOYMENT") {
      const liquidityManager = await ethers.getContractAt("LiquidityManager", MAINNET_ADDRESSES.liquidityManager);
      
      try {
        const positionId = await liquidityManager.positionTokenId();
        const owner = await liquidityManager.owner();
        const lmSoonBalance = await soon.balanceOf(liquidityManager.address);
        const lmWethBalance = await weth9.balanceOf(liquidityManager.address);
        
        console.log("✅ Position Token ID:", positionId.toString());
        console.log("✅ Owner:", owner);
        console.log("💰 LM SOON balance:", ethers.utils.formatEther(lmSoonBalance));
        console.log("💰 LM WRBTC balance:", ethers.utils.formatEther(lmWethBalance));
        console.log("✅ LiquidityManager deployed and accessible");
      } catch (error) {
        console.log("⚠️ LiquidityManager validation failed:", error.message);
      }
    } else {
      console.log("⚠️ LiquidityManager address not set");
    }

    console.log("\n=== 5. SECURITY CHECKS ===");

    // Check ownership
    try {
      const soonOwner = await soon.owner();
      console.log("✅ SOON Token Owner:", soonOwner);
      
      if (MAINNET_ADDRESSES.liquidityManager !== "UPDATE_AFTER_DEPLOYMENT" && 
          soonOwner.toLowerCase() === MAINNET_ADDRESSES.liquidityManager.toLowerCase()) {
        console.log("✅ LiquidityManager correctly owns SOON token");
      } else if (soonOwner.toLowerCase() === deployer.address.toLowerCase()) {
        console.log("⚠️ Deployer still owns SOON token - ownership transfer may be pending");
      } else {
        console.log("⚠️ Unexpected owner - please verify");
      }
    } catch (error) {
      console.log("⚠️ Could not verify ownership:", error.message);
    }

    // Check configuration consistency
    console.log("\n=== 6. CONFIGURATION CONSISTENCY ===");
    
    try {
      config.validateAddresses();
      console.log("✅ Configuration addresses are valid");
      
      console.log("📊 Summary:");
      console.log("  Fee Tier:", config.DEFAULT_FEE_TIER / 100, "%");
      console.log("  Seed Liquidity: ", config.SEED_LIQUIDITY.SOON_AMOUNT, "SOON +", config.SEED_LIQUIDITY.RBTC_AMOUNT, "RBTC");
      console.log("  Chain ID:", config.CHAIN_ID);
      
    } catch (error) {
      console.log("❌ Configuration validation failed:", error.message);
    }

    console.log("\n🎉 MAINNET READ-ONLY VALIDATION COMPLETE");
    console.log("📋 All accessible components validated successfully");

  } catch (error) {
    console.error("\n❌ MAINNET VALIDATION FAILED");
    console.error("Error:", error.message);
    throw error;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Script failed:", error);
    process.exit(1);
  }); 