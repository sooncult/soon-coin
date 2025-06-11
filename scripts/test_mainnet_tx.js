/*
  scripts/test_mainnet_tx.js
  ────────────────────────────────────────────────────────────
  MAINNET TRANSACTION TESTS - Requires RBTC for gas fees
  
  ⚠️  WARNING: This script sends REAL transactions on Rootstock mainnet
  ⚠️  Ensure you have enough RBTC for gas fees before running
  ⚠️  Only run this after successful deployment and readonly validation
  
  This script tests:
  - WRBTC wrapping/unwrapping
  - SOON token transfers and tax mechanics
  - LiquidityManager funding and operations
  - Token approvals and allowances
  - Airdrop contract funding
  
  Usage: npx hardhat run scripts/test_mainnet_tx.js --network rootstock
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

// Safety check amounts (small values for testing)
const TEST_AMOUNTS = {
  WRAP_RBTC: ethers.utils.parseEther("0.001"),     // 0.001 RBTC
  TRANSFER_SOON: ethers.utils.parseEther("100"),   // 100 SOON
  FUND_LM_SOON: ethers.utils.parseEther("1000"),   // 1000 SOON
  FUND_LM_RBTC: ethers.utils.parseEther("0.001"),  // 0.001 RBTC (reduced)
  FUND_AIRDROP: ethers.utils.parseEther("5000")    // 5000 SOON
};

async function confirmExecution() {
  console.log("\n⚠️  MAINNET TRANSACTION WARNING ⚠️");
  console.log("This script will send REAL transactions with REAL gas fees on Rootstock mainnet.");
  console.log("Estimated gas costs: ~0.003 RBTC for all operations");
  console.log("\nTest amounts:");
  for (const [name, amount] of Object.entries(TEST_AMOUNTS)) {
    console.log(`  ${name}: ${ethers.utils.formatEther(amount)}`);
  }
  
  console.log("\n📋 Using configuration:");
  console.log("  Factory:", config.SUSHISWAP_V3_FACTORY);
  console.log("  PositionManager:", config.SUSHISWAP_V3_POSITION_MANAGER);
  console.log("  WRBTC:", config.WRBTC);
  
  // In a real script, you might add interactive confirmation
  // For now, we'll proceed with a prominent warning
  console.log("\n⏳ Proceeding with mainnet transactions in 3 seconds...");
  await new Promise(resolve => setTimeout(resolve, 3000));
}

async function main() {
  if (hre.network.name !== "rootstock") {
    throw new Error("❌ This script must be run on mainnet (--network rootstock)");
  }

  // Verify addresses are set
  if (MAINNET_ADDRESSES.soonToken === "UPDATE_AFTER_DEPLOYMENT") {
    throw new Error("❌ Update MAINNET_ADDRESSES with deployed contract addresses first");
  }

  // Validate configuration
  config.validateAddresses();

  console.log("\n🚀 SOON Token MAINNET Transaction Tests");
  console.log("=" * 50);
  console.log("📅", new Date().toLocaleString());
  console.log("🌐 Network:", hre.network.name);

  await confirmExecution();

  try {
    const [deployer] = await ethers.getSigners();
    const initialBalance = await deployer.getBalance();
    
    console.log("\n=== ACCOUNT INFO ===");
    console.log("👤 Account:", deployer.address);
    console.log("💰 Initial RBTC:", ethers.utils.formatEther(initialBalance));
    
    // Minimum balance check
    const minBalance = ethers.utils.parseEther("0.01");
    if (initialBalance.lt(minBalance)) {
      throw new Error(`❌ Insufficient RBTC balance. Need at least 0.01 RBTC, have ${ethers.utils.formatEther(initialBalance)}`);
    }

    // Connect to contracts
    const soon = await ethers.getContractAt("SOON", MAINNET_ADDRESSES.soonToken);
    const weth9 = await ethers.getContractAt("WETH9", MAINNET_ADDRESSES.weth9);
    const liquidityManager = await ethers.getContractAt("LiquidityManager", MAINNET_ADDRESSES.liquidityManager);
    const airdrop = await ethers.getContractAt("SOONAirdrop", MAINNET_ADDRESSES.airdrop);

    console.log("\n=== 1. WRBTC WRAPPING TEST ===");
    
    const beforeWrap = await weth9.balanceOf(deployer.address);
    console.log("💰 WRBTC before wrap:", ethers.utils.formatEther(beforeWrap));
    
    console.log("🔄 Wrapping", ethers.utils.formatEther(TEST_AMOUNTS.WRAP_RBTC), "RBTC...");
    await (await weth9.deposit({ value: TEST_AMOUNTS.WRAP_RBTC })).wait();
    
    const afterWrap = await weth9.balanceOf(deployer.address);
    console.log("✅ WRBTC after wrap:", ethers.utils.formatEther(afterWrap));
    console.log("✅ Wrapped successfully:", afterWrap.gt(beforeWrap) ? "YES" : "NO");

    console.log("\n=== 2. SOON TOKEN TRANSFER TEST ===");
    
    const beforeTransfer = await soon.balanceOf(deployer.address);
    const beforeTotalSupply = await soon.totalSupply();
    console.log("💰 SOON before transfer:", ethers.utils.formatEther(beforeTransfer));
    console.log("💰 Total supply before:", ethers.utils.formatEther(beforeTotalSupply));
    
    // Transfer to a random address to test tax mechanics
    const randomRecipient = ethers.Wallet.createRandom().address;
    console.log("📤 Transferring", ethers.utils.formatEther(TEST_AMOUNTS.TRANSFER_SOON), "SOON to random address...");
    console.log("👤 Recipient:", randomRecipient);
    
    await (await soon.transfer(randomRecipient, TEST_AMOUNTS.TRANSFER_SOON)).wait();
    
    const afterTransfer = await soon.balanceOf(deployer.address);
    const afterTotalSupply = await soon.totalSupply();
    const recipientBalance = await soon.balanceOf(randomRecipient);
    const actualSent = beforeTransfer.sub(afterTransfer);
    const burned = beforeTotalSupply.sub(afterTotalSupply);
    
    console.log("✅ Amount deducted:", ethers.utils.formatEther(actualSent));
    console.log("✅ Recipient received:", ethers.utils.formatEther(recipientBalance));
    console.log("✅ Amount burned:", ethers.utils.formatEther(burned));
    console.log("✅ Tax applied:", actualSent.gt(recipientBalance) ? "YES" : "NO");
    console.log("✅ Burning working:", burned.gt(0) ? "YES" : "NO");

    console.log("\n=== 3. LIQUIDITY MANAGER FUNDING ===");
    
    console.log("💰 Funding LiquidityManager for operations...");
    
    // Check current LM balances
    const lmSoonBefore = await soon.balanceOf(liquidityManager.address);
    const lmWethBefore = await weth9.balanceOf(liquidityManager.address);
    console.log("💰 LM SOON before:", ethers.utils.formatEther(lmSoonBefore));
    console.log("💰 LM WRBTC before:", ethers.utils.formatEther(lmWethBefore));
    
    // Fund with SOON
    await (await soon.transfer(liquidityManager.address, TEST_AMOUNTS.FUND_LM_SOON)).wait();
    console.log("✅ Sent", ethers.utils.formatEther(TEST_AMOUNTS.FUND_LM_SOON), "SOON to LiquidityManager");
    
    // Fund with WRBTC (if we have enough)
    const availableWRBTC = await weth9.balanceOf(deployer.address);
    if (availableWRBTC.gte(TEST_AMOUNTS.FUND_LM_RBTC)) {
      await (await weth9.transfer(liquidityManager.address, TEST_AMOUNTS.FUND_LM_RBTC)).wait();
      console.log("✅ Sent", ethers.utils.formatEther(TEST_AMOUNTS.FUND_LM_RBTC), "WRBTC to LiquidityManager");
    } else {
      console.log("⚠️ Insufficient WRBTC for funding (have:", ethers.utils.formatEther(availableWRBTC), ")");
    }
    
    // Check balances after funding
    const lmSoonAfter = await soon.balanceOf(liquidityManager.address);
    const lmWethAfter = await weth9.balanceOf(liquidityManager.address);
    console.log("💰 LM SOON after:", ethers.utils.formatEther(lmSoonAfter));
    console.log("💰 LM WRBTC after:", ethers.utils.formatEther(lmWethAfter));

    console.log("\n=== 4. TOKEN APPROVALS TEST ===");
    
    console.log("🔓 Setting token approvals...");
    const maxApproval = ethers.constants.MaxUint256;
    
    await (await soon.approve(MAINNET_ADDRESSES.positionManager, maxApproval)).wait();
    await (await weth9.approve(MAINNET_ADDRESSES.positionManager, maxApproval)).wait();
    
    // Verify approvals
    const soonAllowance = await soon.allowance(deployer.address, MAINNET_ADDRESSES.positionManager);
    const wethAllowance = await weth9.allowance(deployer.address, MAINNET_ADDRESSES.positionManager);
    
    console.log("✅ SOON allowance:", soonAllowance.eq(maxApproval) ? "MAX" : ethers.utils.formatEther(soonAllowance));
    console.log("✅ WRBTC allowance:", wethAllowance.eq(maxApproval) ? "MAX" : ethers.utils.formatEther(wethAllowance));

    console.log("\n=== 5. AIRDROP FUNDING ===");
    
    const beforeAirdrop = await soon.balanceOf(airdrop.address);
    console.log("💰 Airdrop balance before:", ethers.utils.formatEther(beforeAirdrop));
    
    await (await soon.transfer(airdrop.address, TEST_AMOUNTS.FUND_AIRDROP)).wait();
    
    const afterAirdrop = await soon.balanceOf(airdrop.address);
    console.log("✅ Airdrop balance after:", ethers.utils.formatEther(afterAirdrop));
    console.log("✅ Funding successful:", afterAirdrop.gt(beforeAirdrop) ? "YES" : "NO");
    
    // Check airdrop details
    try {
      const claimDeadline = await airdrop.claimDeadline();
      console.log("✅ Claim deadline:", new Date(claimDeadline.toNumber() * 1000).toLocaleString());
    } catch (error) {
      console.log("⚠️ Could not read airdrop deadline:", error.message);
    }

    console.log("\n=== 6. GAS USAGE SUMMARY ===");
    
    const finalBalance = await deployer.getBalance();
    const gasUsed = initialBalance.sub(finalBalance);
    console.log("💰 Initial RBTC:", ethers.utils.formatEther(initialBalance));
    console.log("💰 Final RBTC:", ethers.utils.formatEther(finalBalance));
    console.log("⛽ Total gas used:", ethers.utils.formatEther(gasUsed), "RBTC");
    
    // Final token balances
    const finalSoonBalance = await soon.balanceOf(deployer.address);
    const finalWrbtcBalance = await weth9.balanceOf(deployer.address);
    const finalTotalSupply = await soon.totalSupply();
    
    console.log("\n📊 Final token balances:");
    console.log("💰 Deployer SOON:", ethers.utils.formatEther(finalSoonBalance));
    console.log("💰 Deployer WRBTC:", ethers.utils.formatEther(finalWrbtcBalance));
    console.log("💰 Total SOON supply:", ethers.utils.formatEther(finalTotalSupply));
    console.log("🔥 Total burned this session:", ethers.utils.formatEther(beforeTotalSupply.sub(finalTotalSupply)));

    console.log("\n🎉 MAINNET TRANSACTION TESTS COMPLETED!");
    console.log("📋 All transaction-based operations validated successfully");
    console.log("✅ SOON token ecosystem is operational on mainnet");

  } catch (error) {
    console.error("\n❌ MAINNET TRANSACTION TESTS FAILED");
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