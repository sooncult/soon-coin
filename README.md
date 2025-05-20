# SOON Token Ecosystem

## Overview

SOON is a deflationary and reflective token built on the Rootstock (RSK) blockchain. The project implements a modern tokenomics model with automated liquidity management through SushiSwap V3.

### Token Economics

- **Total Supply**: 6,942,000,000 SOON tokens
- **Distribution**: 
  - 95% allocated for community airdrop
  - 5% for initial liquidity provision
- **Deflationary Mechanism**: 6.9% tax on all transfers, distributed as:
  - 3.33% reflection to token holders
  - 2.00% burned (permanently removed from circulation)
  - 1.57% for automated liquidity management

## Smart Contract Architecture

The ecosystem consists of three primary contracts:

### 1. SOON.sol
- ERC20 token with reflection, burn, and liquidity accumulation mechanisms
- Implements RFI-style holder rewards without staking
- Configurable tax rates with maximum caps
- Address exclusion system for fees and rewards

### 2. SOONAirdrop.sol
- Merkle-proof based airdrop distribution system
- Gas-efficient claim verification
- Time-limited claiming period

### 3. LiquidityManager.sol
- Automated SushiSwap V3 concentrated liquidity position management
- TWAP-based position rebalancing around price movements
- Fee collection and reinvestment for compounding returns
- Designed for eventual full decentralization

## Dependencies

The project relies on:
- OpenZeppelin contracts for ERC20 and security patterns
- SushiSwap V3 (simplified adaptations) for concentrated liquidity
- Hardhat development environment
- Ethers.js for deployment scripts
- MerkleTreeJS and keccak256 for airdrop verification

## Setup & Development

### Prerequisites

- Node.js (LTS version recommended)
- npm or yarn
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/soon.git
cd soon

# Install dependencies
npm install
```

### Environment Configuration

Create a `.env` file in the project root with the following variables:

```
PRIVATE_KEY=your_private_key_here
ROOTSTOCK_TESTNET_RPC_URL=https://public-node.testnet.rsk.co
ETHERSCAN_API_KEY=your_etherscan_api_key_here
```

## Compilation

```bash
# Compile all contracts
npm run compile

# Or using npx
npx hardhat compile
```

## Testing

The project includes comprehensive test suites covering all aspects of functionality:

```bash
# Run all tests
npm test

# Run specific test file
npx hardhat test test/SOON.test.js

# Run integration tests only
npx hardhat test test/Integration.test.js
```

### Test Coverage Report

```bash
npx hardhat coverage
```

## Deployment

### Local Development Environment

```bash
# Start a local Hardhat node
npx hardhat node

# Deploy to local node (in a separate terminal)
npx hardhat run scripts/deploy.js --network localhost
```

### Rootstock Testnet Deployment

```bash
# Deploy to RSK Testnet
npx hardhat run scripts/deploy.js --network rootstockTestnet
```

### Deployment Options

The deployment script handles different environments automatically:
- On local networks, it sets up mock oracles for price feeds
- On testnet/mainnet, it uses actual SushiSwap V3 pools as price oracles

## Security Considerations

- All contracts use SafeMath patterns (implicit in Solidity ^0.8.17)
- ReentrancyGuard protection for liquidity operations
- Owner functions include timelock mechanisms
- Designed for eventual ownership renouncement

## Project Structure

```
contracts/
├── SOON.sol                # Main token contract
├── SOONAirdrop.sol         # Airdrop distribution contract
├── LiquidityManager.sol    # SushiSwap V3 position manager
├── sushiswap/              # SushiSwap V3 simplified interfaces
│   ├── NonfungiblePositionManager.sol
│   ├── Pool.sol
│   ├── Factory.sol
│   └── WETH9.sol           # WRBTC wrapper for native RBTC
test/
├── SOON.test.js            # Token unit tests
├── SOONAirdrop.test.js     # Airdrop unit tests
├── LiquidityManager.test.js # Liquidity manager unit tests
└── Integration.test.js     # Full system integration tests
scripts/
└── deploy.js               # Deployment script for all environments
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. 