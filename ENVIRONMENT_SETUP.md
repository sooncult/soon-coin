# Environment Setup Guide

This guide explains how to configure environment variables and settings for the SOON Token project across different networks.

## 📁 File Structure

```
soon/
├── .env                      # All environment variables (testnet + mainnet)
├── config/
│   └── mainnet.js           # Mainnet SushiSwap addresses (safe to commit)
├── hardhat.config.js        # Network configuration
└── ENVIRONMENT_SETUP.md     # This guide
```

## 🔐 Environment File

### `.env` (for both testnet and mainnet)
```bash
# Rootstock Testnet Configuration
PRIVATE_KEY=your_testnet_private_key_without_0x_prefix
ROOTSTOCK_TESTNET_RPC_URL=https://public-node.testnet.rsk.co

# Rootstock Mainnet Configuration
PRIVATE_KEY_MAINNET=your_mainnet_private_key_without_0x_prefix
ROOTSTOCK_MAINNET_RPC_URL=https://public-node.rsk.co

# Optional
ETHERSCAN_API_KEY=your_api_key_for_contract_verification
```

## 🏗️ SushiSwap Configuration

### Update `config/mainnet.js`

**⚠️ REQUIRED: Find the Position Manager Address**

You need to find the SushiSwap V3 Position Manager address on Rootstock mainnet:

1. **Visit Rootstock Explorer**: https://explorer.rsk.co
2. **Search for SushiSwap contracts**:
   - Search for "SushiSwap" or "NonfungiblePositionManager"
   - Look for V3 position manager deployments
   - Check contract creation dates (should be June 2024 or later)
3. **Verify the contract**:
   - Should have `factory()` function that returns: `0x46b3fdf7b5cde91ac049936bf0bdb12c5d22202e`
   - Should have `WETH9()` function that returns: `0x542fDA317318eBF1d3DEAf76E0B632741A7e677d`

Then replace the placeholder in `config/mainnet.js`:

```javascript
// Replace this line:
SUSHISWAP_V3_POSITION_MANAGER: "0x0000000000000000000000000000000000000000", 

// With the real address:
SUSHISWAP_V3_POSITION_MANAGER: "0xYourFoundAddressHere",
```

**Alternative methods to find the address:**
- Ask in Rootstock Discord: https://discord.gg/rootstock
- Ask in SushiSwap Discord: https://discord.gg/sushiswap
- Check SushiSwap V3 documentation for Rootstock
- Look for existing SushiSwap V3 pools and check their creation transactions

This file contains:
- ✅ SushiSwap V3 Factory address (already set)
- ⚠️ Position Manager address (needs to be found)  
- ✅ WRBTC address (already set)
- ✅ Default fee tier (0.3%)
- ✅ Seed liquidity amounts
- ✅ Gas settings
- ✅ Network configuration

## 🔧 Security Best Practices

### Environment File Security
1. **Never commit `.env`** - contains private keys
2. **Add to `.gitignore`**:
   ```
   .env
   .env.local
   .env.*.local
   ```
3. **Use different private keys** for testnet vs mainnet
4. **Keep private keys secure** - no 0x prefix needed

### Private Key Management
- **Testnet**: Can use a dedicated test account with minimal funds
- **Mainnet**: Use a secure hardware wallet or dedicated deployment account
- **Never share private keys** in chat, email, or public repositories

## 🚀 Usage Examples

### Testnet Deployment
```bash
# Uses PRIVATE_KEY from .env
npx hardhat run scripts/test_testnet_comprehensive.js --network rootstockTestnet
```

### Mainnet Deployment
```bash
# Uses PRIVATE_KEY_MAINNET from .env
npx hardhat run scripts/deploy_mainnet.js --network rootstock
```

### Mainnet Testing (after deployment)
```bash
# Read-only validation (no gas fees)
npx hardhat run scripts/test_mainnet_readonly.js --network rootstock

# Transaction testing (requires RBTC for gas)
npx hardhat run scripts/test_mainnet_tx.js --network rootstock
```

## 📋 Configuration Validation

The system automatically validates your configuration:

### At Runtime
```javascript
// This runs automatically
config.validateAddresses();

// Checks:
// ✅ All addresses are 40 characters
// ✅ All addresses start with 0x  
// ✅ No placeholder text remains
// ❌ Throws error if validation fails
```

### Manual Check
```bash
# Test configuration loading
npx hardhat console --network rootstock
> const config = require('./config/mainnet.js')
> config.validateAddresses()
✅ All mainnet addresses validated
```

## ⚡ Network Switching

The system automatically:
1. **Detects target network** from `--network` parameter
2. **Uses correct private key**:
   - `rootstock` → `PRIVATE_KEY_MAINNET`
   - `rootstockTestnet` → `PRIVATE_KEY`
3. **Uses correct configuration**:
   - Mainnet → `config/mainnet.js`
   - Testnet → hardcoded values

## 🔍 Troubleshooting

### Common Issues

**"Position Manager address is still placeholder"**
```bash
# Solution: Find the real SushiSwap V3 Position Manager address
# Check Rootstock explorer: https://explorer.rsk.co
# Search for "SushiSwap" or "NonfungiblePositionManager"
```

**"Configuration validation failed"**
```bash
# Check address format (40 chars, starts with 0x)
# Remove any placeholder text like "0x0000000000000000000000000000000000000000"
```

**"Account doesn't exist or insufficient funds"**
```bash
# Ensure mainnet account is funded with RBTC
# Minimum required: 0.2 RBTC (gas + liquidity)
```

## 💡 Pro Tips

1. **Test on testnet first** - always validate on testnet before mainnet
2. **Keep backups** - save deployment addresses safely
3. **Use hardware wallets** - for mainnet private keys when possible
4. **Monitor gas prices** - adjust settings in config if needed
5. **Start small** - use minimal amounts for initial testing

## 📞 Support

If you encounter issues:
1. Check this guide first
2. Verify all addresses are complete and correctly formatted
3. Ensure sufficient RBTC balance for mainnet operations
4. Test configuration validation manually

Remember: Mainnet operations use real RBTC, so always double-check your configuration! 