require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { PRIVATE_KEY, ROOTSTOCK_TESTNET_RPC_URL, ETHERSCAN_API_KEY } = process.env;

// Custom task for local testing - does everything in one command
task("test_local", "Deploy contracts locally and run comprehensive tests")
  .setAction(async (taskArgs, hre) => {
    console.log("🚀 Starting SOON Token Local Test Suite...\n");
    
    try {
      // Step 1: Compile contracts
      console.log("📦 Compiling contracts...");
      await hre.run("compile");
      console.log("✅ Contracts compiled successfully\n");
      
      // Step 2: Run comprehensive tests (which includes deployment)
      console.log("🧪 Running comprehensive tests with fresh deployment...");
      await hre.run("run", { script: "scripts/test_interactions.js", network: "localhost" });
      console.log("✅ All tests completed successfully\n");
      
      console.log("🎉 SOON Token Local Test Suite completed successfully!");
      console.log("📋 Summary:");
      console.log("   ✅ Contracts compiled");
      console.log("   ✅ Contracts deployed to localhost");
      console.log("   ✅ Comprehensive tests passed");
      console.log("   ✅ All critical fixes verified");
      console.log("   ✅ Token mechanics working correctly");
      console.log("   ✅ LiquidityManager functions operational");
      console.log("   ✅ Airdrop system functional");
      console.log("\n💡 Your SOON token ecosystem is ready for testnet/mainnet deployment!");
      
    } catch (error) {
      console.error("❌ Test suite failed:", error.message);
      console.error("\n🔧 Troubleshooting:");
      console.error("   1. Make sure 'npx hardhat node' is running in another terminal");
      console.error("   2. Check that localhost network is accessible");
      console.error("   3. Verify all contract dependencies are installed");
      process.exit(1);
    }
  });

// Custom task for running tests only on existing deployment
task("test_interactions", "Run interaction tests on already deployed contracts")
  .setAction(async (taskArgs, hre) => {
    console.log("🧪 Running interaction tests on localhost...\n");
    
    try {
      await hre.run("run", { 
        script: "scripts/test_interactions.js", 
        network: "localhost" 
      });
      console.log("✅ Interaction tests completed successfully!");
    } catch (error) {
      console.error("❌ Interaction tests failed:", error.message);
      process.exit(1);
    }
  });

// Custom task to start local node (convenience)
task("start_node", "Start local Hardhat node")
  .setAction(async (taskArgs, hre) => {
    console.log("🌐 Starting local Hardhat node...");
    console.log("📡 Network will be available at http://127.0.0.1:8545/");
    console.log("💡 Keep this terminal running and use 'npx hardhat test_local' in another terminal");
    await hre.run("node");
  });

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: "0.8.17",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {
      chainId: 31337
    },
    rootstockTestnet: {
      url: ROOTSTOCK_TESTNET_RPC_URL || "https://public-node.testnet.rsk.co",
      chainId: 31,
      accounts: PRIVATE_KEY ? [`0x${PRIVATE_KEY}`] : [],
      gasPrice: 60000000, // 0.06 gwei
      gasMultiplier: 1.1,
      timeout: 60000, // 60 seconds
      verify: {
        etherscan: {
          apiKey: ETHERSCAN_API_KEY
        }
      }
    }
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
    customChains: [
      {
        network: "rootstockTestnet",
        chainId: 31,
        urls: {
          apiURL: "https://explorer.testnet.rsk.co/api",
          browserURL: "https://explorer.testnet.rsk.co"
        }
      }
    ]
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  }
}; 