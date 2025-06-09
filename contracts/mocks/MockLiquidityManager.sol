// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "../LiquidityManager.sol";

/**
 * @title MockLiquidityManager
 * @dev Test version of LiquidityManager with mock oracle functionality
 * This contract should ONLY be used for testing and NEVER deployed to mainnet
 */
contract MockLiquidityManager is LiquidityManager {
    bool public isMockMode = true;
    
    // Mock oracle state
    int24 private mockTick = 0;
    uint160 private mockSqrtPriceX96 = uint160(1 << 96);
    
    constructor(
        address _soonTokenAddress,
        address _rbtcTokenAddress,
        address _positionManagerAddress
    ) LiquidityManager(
        _soonTokenAddress,
        _rbtcTokenAddress,
        _positionManagerAddress,
        address(1) // Dummy oracle address since we'll override the calls
    ) {}
    
    /**
     * @notice Creates an initial position (simplified version for testing)
     */
    function createInitialPosition() external onlyOwner {
        require(positionTokenId == 0, "LM: Position already initialized");
        // For testing, just set a dummy position ID
        positionTokenId = 1;
        emit PositionInitialized(1, -2000, 2000);
    }
    
    /**
     * @notice Sets mock mode for testing
     * @param _isMockMode Whether to enable mock mode
     */
    function setMockMode(bool _isMockMode) external onlyOwner {
        require(!isLocked, "LM: Contract is locked");
        isMockMode = _isMockMode;
    }
    
    /**
     * @notice Sets mock oracle price for testing
     * @param _tick The mock tick value
     * @param _sqrtPriceX96 The mock sqrt price
     */
    function setMockOraclePrice(int24 _tick, uint160 _sqrtPriceX96) external onlyOwner {
        mockTick = _tick;
        mockSqrtPriceX96 = _sqrtPriceX96;
    }
    
    /**
     * @notice Public rebalance that bypasses rate limiting in test mode
     */
    function rebalancePosition() external override nonReentrant {
        if (!isMockMode) {
            require(block.timestamp >= lastRebalanceTimestamp + MIN_REBALANCE_INTERVAL, "LM: Too soon to rebalance");
        }
        require(positionTokenId != 0, "LM: Position not initialized");
        
        // Call the internal rebalance logic
        _rebalancePosition();
    }
    
    /**
     * @notice Override getTwapTick to return mock values in test mode
     */
    function _getTwapTick() internal view override returns (int24) {
        if (isMockMode) {
            return mockTick;
        }
        return super._getTwapTick();
    }
}

/**
 * @title MockPoolOracle
 * @dev Mock implementation of IUniswapV3PoolOracle for testing
 */
contract MockPoolOracle is IUniswapV3PoolOracle {
    int24 public mockTick = 0;
    uint160 public mockSqrtPriceX96 = uint160(1 << 96);
    
    function setMockPrice(int24 _tick, uint160 _sqrtPriceX96) external {
        mockTick = _tick;
        mockSqrtPriceX96 = _sqrtPriceX96;
    }
    
    function observe(uint32[] calldata secondsAgos) 
        external 
        view 
        override
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s) 
    {
        tickCumulatives = new int56[](secondsAgos.length);
        secondsPerLiquidityCumulativeX128s = new uint160[](secondsAgos.length);
        
        // Return consistent mock data based on mockTick
        for (uint i = 0; i < secondsAgos.length; i++) {
            tickCumulatives[i] = int56(mockTick) * int56(uint56(secondsAgos[i]));
            secondsPerLiquidityCumulativeX128s[i] = 0;
        }
        
        return (tickCumulatives, secondsPerLiquidityCumulativeX128s);
    }
    
    function slot0() external view override returns (
        uint160 sqrtPriceX96,
        int24 tick,
        uint16 observationIndex,
        uint16 observationCardinality,
        uint16 observationCardinalityNext,
        uint8 feeProtocol,
        bool unlocked
    ) {
        return (
            mockSqrtPriceX96,
            mockTick,
            0,
            1,
            1,
            0,
            true
        );
    }
} 