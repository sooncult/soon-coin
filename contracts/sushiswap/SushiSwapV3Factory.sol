// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./SushiSwapV3Pool.sol";

contract SushiSwapV3Factory is Ownable {
    // Pool creation event
    event PoolCreated(
        address indexed token0,
        address indexed token1,
        uint24 indexed fee,
        int24 tickSpacing,
        address pool
    );

    // Mappings to track pools and fee → tickSpacing
    mapping(address => mapping(address => mapping(uint24 => address))) public getPool;
    mapping(uint24 => int24) public feeAmountTickSpacing;

    constructor() {
        // Default tick spacing for standard fee tiers
        feeAmountTickSpacing[500]   = 10;   // 0.05%
        feeAmountTickSpacing[3000]  = 60;   // 0.3%
        feeAmountTickSpacing[10000] = 200;  // 1%
    }

    function createPool(
        address tokenA,
        address tokenB,
        uint24 fee
    ) external returns (address pool) {
        require(tokenA != tokenB, "Identical addresses");
        (address token0, address token1) = tokenA < tokenB
            ? (tokenA, tokenB)
            : (tokenB, tokenA);
        require(token0 != address(0), "Zero address");
        require(getPool[token0][token1][fee] == address(0), "Pool exists");
        require(feeAmountTickSpacing[fee] != 0, "Invalid fee");

        // Deploy a new pool instance
        pool = address(new SushiSwapV3Pool(token0, token1, fee, feeAmountTickSpacing[fee]));
        getPool[token0][token1][fee] = pool;
        getPool[token1][token0][fee] = pool;

        emit PoolCreated(token0, token1, fee, feeAmountTickSpacing[fee], pool);
    }

    function setFeeAmountTickSpacing(uint24 fee, int24 tickSpacing) external onlyOwner {
        require(tickSpacing > 0, "Invalid tick spacing");
        feeAmountTickSpacing[fee] = tickSpacing;
    }
}