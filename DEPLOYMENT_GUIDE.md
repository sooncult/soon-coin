# SOON Token Mainnet Deployment Guide

## 🚨 Critical Changes for Mainnet

### 1. Removed Test-Only Functions
The following functions have been removed from the production `LiquidityManager` contract:
- `setMockMode()` - Test-only function to toggle mock oracle
- `createInitialPosition()` - Simplified test function
- `observe()` and `slot0()` - Mock oracle implementations

These functions now exist only in `MockLiquidityManager` for testing.

### 2. Production Requirements
The production `LiquidityManager` now enforces:
- **Required Oracle**: Constructor requires a valid pool oracle address (cannot be address(0))
- **Minimum Liquidity**: `MIN_LIQUIDITY = 1e15` wei required for initial position
- **Rate Limiting**: 1 hour minimum between rebalances (always enforced)

### 3. Contract Architecture

```
Production:
├── LiquidityManager.sol          # Production contract (no test functions)
├── MockLiquidityManager.sol      # Test-only contract with mock features
└── MockPoolOracle.sol           # Test-only oracle implementation

Testing:
- Use MockLiquidityManager which extends LiquidityManager
- MockPoolOracle provides test oracle functionality
```

## 📋 Pre-Deployment Checklist

### 1. Verify Mainnet Addresses
Before deploying, obtain the correct addresses for:
- [ ] SushiSwap V3 NonfungiblePositionManager on Rootstock
- [ ] WRBTC (Wrapped RBTC) token address
- [ ] SushiSwap V3 Factory address (if creating new pool)

### 2. Review Contract Parameters
- [ ] `POOL_FEE = 3000` (0.3% fee tier) - Verify this matches your pool
- [ ] `tickDistance = 2000` - Adjust based on desired liquidity range
- [ ] `twapIntervalSeconds = 1800` (30 minutes) - Adjust TWAP window

### 3. Prepare Deployment Wallet
- [ ] Sufficient RBTC for deployment gas costs
- [ ] SOON tokens for initial liquidity
- [ ] WRBTC tokens for initial liquidity

## 🚀 Deployment Steps

### Step 1: Deploy Core Contracts

```bash
# For mainnet deployment
npx hardhat run scripts/deploy.js --network rootstock

# The script will:
# 1. Show a 5-second warning for mainnet deployment
# 2. Deploy SOON token
# 3. Deploy SOONAirdrop
# 4. Deploy LiquidityManager with real oracle
```

### Step 2: Create/Verify Pool

If using existing SushiSwap pool:
```javascript
const poolAddress = "0x..."; // Existing SOON/WRBTC pool
```

If creating new pool:
```javascript
// Via SushiSwap V3 Factory
const tx = await factory.createPool(
    soonToken.address,
    wrbtcAddress,
    3000 // 0.3% fee tier
);
```

### Step 3: Initialize Liquidity Manager

```javascript
// 1. Transfer initial liquidity to LiquidityManager
await soonToken.transfer(liquidityManager.address, initialSOONAmount);
await wrbtc.transfer(liquidityManager.address, initialWRBTCAmount);

// 2. Initialize position
await liquidityManager.initializePosition(
    initialSOONAmount,
    initialWRBTCAmount,
    currentTick // Get from pool.slot0()
);
```

### Step 4: Configure and Lock

```javascript
// 1. Set optimal parameters (if different from defaults)
await liquidityManager.updateTickDistance(2000);
await liquidityManager.updateTwapInterval(1800);

// 2. Lock the contract (irreversible!)
await liquidityManager.lock();

// 3. (Optional) Renounce ownership
await liquidityManager.renounceOwnership();
```

## ⚠️ Important Considerations

### Position Management Strategy
The current implementation mints NEW positions when rebalancing instead of using `increaseLiquidity`. This means:
- Old positions are not automatically cleaned up
- Each rebalance creates a new NFT position
- Consider implementing a cleanup mechanism or switching to `increaseLiquidity`

### Security Considerations
1. **Oracle Dependency**: The contract relies on the pool's TWAP oracle. Ensure the pool has sufficient liquidity and history.
2. **Rate Limiting**: 1-hour minimum between rebalances prevents rapid position changes
3. **Locked Functions**: Once locked, owner functions cannot be called

### Gas Optimization
- Rebalancing only occurs when position moves outside range
- Consider implementing keeper incentives for rebalancing

## 🧪 Testing Locally

For local testing, use the mock contracts:

```javascript
// Deploy MockLiquidityManager for testing
const MockLiquidityManager = await ethers.getContractFactory("MockLiquidityManager");
const liquidityManager = await MockLiquidityManager.deploy(
    soon.address,
    weth.address,
    positionManager.address
);

// Test-specific functions available:
await liquidityManager.setMockMode(true);
await liquidityManager.createInitialPosition();
await liquidityManager.setMockOraclePrice(tick, sqrtPriceX96);
```

## 📊 Post-Deployment Monitoring

1. **Verify Contracts** on block explorer
2. **Monitor Position Health**:
   - Current tick vs position range
   - Collected fees
   - Rebalance frequency
3. **Set up Keeper Bot** (optional) to call `rebalancePosition()`

## 🔴 Emergency Procedures

If issues arise:
1. **Rescue Tokens**: Use `rescueTokens()` for non-SOON/RBTC tokens (owner only, before lock)
2. **Pause Operations**: No pause function - consider adding if needed
3. **Migration**: Deploy new LiquidityManager and transfer liquidity

## 📝 Deployment Verification

After deployment, verify:
```bash
# Check deployment
- [ ] All contracts deployed successfully
- [ ] LiquidityManager has correct oracle address
- [ ] Initial position created with expected liquidity
- [ ] Rebalancing works as expected
- [ ] Fees are collected properly
```

---

**Remember**: Once deployed and locked, the LiquidityManager becomes immutable. Test thoroughly on testnet before mainnet deployment! 