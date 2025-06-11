/*
  config/mainnet.js
  ──────────────────────────────────────────────────────────────
  SushiSwap V3 Mainnet Configuration for Rootstock
  
  This file contains the official SushiSwap V3 contract addresses
  for Rootstock mainnet. Safe to commit to git.
  
  Last updated: [UPDATE_DATE]
  Source: SushiSwap official documentation / Rootstock explorer
*/

module.exports = {
  // SushiSwap V3 Core Contracts
  SUSHISWAP_V3_FACTORY: "0x46b3fdf7b5cde91ac049936bf0bdb12c5d22202e",
  SUSHISWAP_V3_POSITION_MANAGER: "0x0389879e0156033202c44bf784ac18fc02edee4f", // SushiSwap V3 Positions NFT-V1
  
  // Rootstock Native Tokens
  WRBTC: "0x542fDA317318eBF1d3DEAf76E0B632741A7e677d",
  
  // Pool Configuration
  DEFAULT_FEE_TIER: 3000, // 0.3% fee tier (most liquid for most pairs)
  
  // Deployment Settings
  SEED_LIQUIDITY: {
    SOON_AMOUNT: "10000",    // 10k SOON for initial pool
    RBTC_AMOUNT: "0.1"       // 0.1 RBTC for initial pool
  },
  
  // Gas Configuration
  GAS_SETTINGS: {
    gasPrice: 60000000,      // 0.06 gwei
    gasMultiplier: 1.1,
    timeout: 60000           // 60 seconds
  },
  
  // Network Info
  CHAIN_ID: 30,
  RPC_URL: "https://public-node.rsk.co",
  EXPLORER_URL: "https://explorer.rsk.co",
  
  // Validation
  validateAddresses() {
    const addresses = [
      this.SUSHISWAP_V3_FACTORY,
      this.SUSHISWAP_V3_POSITION_MANAGER,
      this.WRBTC
    ];
    
    for (const addr of addresses) {
      if (!addr || addr.includes("UPDATE_WITH")) {
        throw new Error(`Invalid or incomplete address: ${addr}`);
      }
      if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
        throw new Error(`Invalid address format: ${addr}`);
      }
      if (addr === "0x0000000000000000000000000000000000000000") {
        throw new Error(`Position Manager address is still placeholder (0x0000...)`);
      }
    }
    
    console.log("✅ All mainnet addresses validated");
    return true;
  }
}; 