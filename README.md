# SOON Token Smart Contracts

## Overview

This repository contains the smart contracts for the SOON ecosystem, including:

- **SOON.sol**: ERC20 token with deflationary (tax, burn) and reflective (RFI) mechanics.
- **SOONAirdrop.sol**: Manages Merkle airdrop claims for SOON token distribution.
- **LiquidityManager.sol**: Automates SushiSwap V3 liquidity provision and rebalancing for SOON/RBTC.

All contracts are written in Solidity ^0.8.17 and use OpenZeppelin libraries for security and best practices.

## Project Structure

```
contracts/
  SOON.sol              # Main ERC20 token contract
  SOONAirdrop.sol       # Merkle airdrop claim contract
  LiquidityManager.sol  # SushiSwap V3 liquidity automation
scripts/
  deploy.js             # Example deployment script
hardhat.config.js       # Hardhat configuration
package.json            # Project dependencies and scripts
```

## Getting Started

### Prerequisites
- Node.js (LTS recommended)
- npm

### Install Dependencies
```bash
npm install
```

### Compile Contracts
```bash
npx hardhat compile
```

### Run Tests
```bash
npx hardhat test
```

### Deploy Contracts
Edit `scripts/deploy.js` with your deployment logic, then run:
```bash
npx hardhat run scripts/deploy.js --network <network>
```

## Security
- Uses OpenZeppelin contracts for ERC20, Ownable, and security patterns.
- Review and audit recommended before mainnet deployment.

## License
This project is licensed under the MIT License. See [LICENSE](LICENSE) for details. 