require("@nomicfoundation/hardhat-toolbox");
require('dotenv').config();
const { PRIVATE_KEY, ROOTSTOCK_TESTNET_RPC_URL, ETHERSCAN_API_KEY } = process.env;

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