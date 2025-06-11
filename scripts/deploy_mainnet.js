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

  REQUIRED ENV (see .env.example):
    ROOTSTOCK_MAINNET_RPC_URL
    PRIVATE_KEY_MAINNET

    SUSHISWAP_V3_FACTORY_MAINNET      – official SushiSwap V3 factory
    SUSHISWAP_V3_PM_MAINNET           – NonfungiblePositionManager
    WRBTC_MAINNET                     – canonical wrapped-RBTC (WETH-style)

  NOTE:  This script sends real txs on Rootstock main-net.
         Make sure the deployer account is funded with RBTC & SOON.
*/

require("dotenv").config();
const hre   = require("hardhat");
const { ethers } = hre;

// Canonical addresses pulled from env
const FACTORY = process.env.SUSHISWAP_V3_FACTORY_MAINNET;
const PM      = process.env.SUSHISWAP_V3_PM_MAINNET;    // NonfungiblePositionManager
const WRBTC   = process.env.WRBTC_MAINNET;

async function main() {
  if (!FACTORY || !PM || !WRBTC) {
    throw new Error("❌ Missing mainnet env vars (FACTORY / PM / WRBTC)");
  }

  const [deployer] = await ethers.getSigners();
  console.log("\n🚀  Main-net deployment – deployer:", deployer.address);
  console.log("💰  RBTC balance:", ethers.utils.formatEther(await deployer.getBalance()));

  // 1. Deploy SOON token
  const SOON = await ethers.getContractFactory("SOON");
  const soon = await SOON.deploy();
  await soon.deployed();
  console.log("✅ SOON deployed:", soon.address);

  // 2. Deploy Airdrop (30-day window from now)
  const SECONDS_30_DAYS = 60 * 60 * 24 * 30;
  const SOONAirdrop = await ethers.getContractFactory("SOONAirdrop");
  const airdrop = await SOONAirdrop.deploy(soon.address, Math.floor(Date.now() / 1000) + SECONDS_30_DAYS);
  await airdrop.deployed();
  console.log("✅ Airdrop deployed:", airdrop.address);

  // 3. Create seed V3 pool with tiny liquidity
  console.log("\n🏗️  Creating SOON/WRBTC V3 pool w/ seed liquidity…");

  const token0 = soon.address.toLowerCase() < WRBTC.toLowerCase() ? soon.address : WRBTC;
  const token1 = soon.address.toLowerCase() < WRBTC.toLowerCase() ? WRBTC : soon.address;
  const feeTier   = 3000;          // 0.30 %
  const tickLower = -60000;        // very wide bootstrap range
  const tickUpper =  60000;

  // Seed amounts (adjust to taste ‑ these just initialise the pool)
  const SEED_SOON = ethers.utils.parseEther("1000");   // 1k SOON
  const SEED_RBTC = ethers.utils.parseEther("0.01");   // 0.01 RBTC

  // Wrap RBTC → WRBTC
  const WETH9 = await ethers.getContractAt("WETH9", WRBTC);
  await (await WETH9.deposit({ value: SEED_RBTC })).wait();
  await (await WETH9.approve(PM, SEED_RBTC)).wait();
  console.log("✅ Wrapped", ethers.utils.formatEther(SEED_RBTC), "RBTC → WRBTC");

  // Approve SOON to PM
  await (await soon.approve(PM, SEED_SOON)).wait();

  // Mint via NonfungiblePositionManager
  const NPM = await ethers.getContractAt("NonfungiblePositionManager", PM);
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
  console.log("⏳ Minting seed LP (this tx creates the pool if it doesn't exist)…");
  await (await NPM.mint(params)).wait();
  console.log("✅ Seed position minted");

  // Retrieve pool address
  const Factory = await ethers.getContractAt("SushiSwapV3Factory", FACTORY);
  const pool = await Factory.getPool(soon.address, WRBTC, feeTier);
  if (pool === ethers.constants.AddressZero) throw new Error("Pool creation failed");
  console.log("✅ SOON/WRBTC pool:", pool);

  // 4. Deploy LiquidityManager (production-mode)
  const LiquidityManager = await ethers.getContractFactory("LiquidityManager");
  const lm = await LiquidityManager.deploy(soon.address, WRBTC, PM, pool);
  await lm.deployed();
  console.log("✅ LiquidityManager deployed:", lm.address);

  // 5. Make LiquidityManager the token owner/manager
  await (await soon.setLiquidityManager(lm.address)).wait();
  console.log("✅ LiquidityManager linked & now owns SOON token");

  // Summary
  console.log("\n🎉  MAIN-NET DEPLOY COMPLETE");
  console.log("———————————————————————————————————");
  console.log("SOON:", soon.address);
  console.log("Airdrop:", airdrop.address);
  console.log("Pool:", pool);
  console.log("LiquidityManager:", lm.address);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
}); 