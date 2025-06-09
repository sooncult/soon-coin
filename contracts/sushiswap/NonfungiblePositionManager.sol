// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title NonfungiblePositionManager
 * @dev Mock implementation of Uniswap V3 NonfungiblePositionManager for testing
 * This should match the interface expected by LiquidityManager
 */
contract NonfungiblePositionManager is ERC721, Ownable {
    struct Position {
        uint96 nonce;
        address operator;
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        uint256 feeGrowthInside0LastX128;
        uint256 feeGrowthInside1LastX128;
        uint128 tokensOwed0;
        uint128 tokensOwed1;
    }

    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }

    struct IncreaseLiquidityParams {
        uint256 tokenId;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }

    struct DecreaseLiquidityParams {
        uint256 tokenId;
        uint128 liquidity;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }

    struct CollectParams {
        uint256 tokenId;
        address recipient;
        uint128 amount0Max;
        uint128 amount1Max;
    }

    address public immutable factory;
    address public immutable WETH9;
    mapping(uint256 => Position) public positions;
    uint256 private _nextId = 1;

    event IncreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
    event DecreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
    event Collect(uint256 indexed tokenId, uint256 amount0, uint256 amount1);

    constructor(
        address _factory,
        address _WETH9,
        address _owner
    ) ERC721("SushiSwap V3 Positions", "SUSHI-V3-POS") {
        factory = _factory;
        WETH9 = _WETH9;
        transferOwnership(_owner);
    }

    function mint(MintParams calldata params)
        external
        payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        require(params.deadline >= block.timestamp, "Expired");
        require(params.token0 < params.token1, "Token order");

        tokenId = _nextId++;
        _mint(params.recipient, tokenId);

        // Initialize the position
        Position storage position = positions[tokenId];
        position.operator = params.recipient;
        position.token0 = params.token0;
        position.token1 = params.token1;
        position.fee = params.fee;
        position.tickLower = params.tickLower;
        position.tickUpper = params.tickUpper;
        position.liquidity = uint128(params.amount0Desired); // Simplified for mock

        liquidity = uint128(params.amount0Desired);
        amount0 = params.amount0Desired;
        amount1 = params.amount1Desired;

        // Transfer tokens from sender (simplified mock - doesn't actually transfer)
        // In a real implementation, this would interact with the pool

        emit IncreaseLiquidity(tokenId, liquidity, amount0, amount1);
    }

    function increaseLiquidity(IncreaseLiquidityParams calldata params)
        external
        payable
        returns (uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        require(params.deadline >= block.timestamp, "Expired");
        Position storage position = positions[params.tokenId];
        require(position.liquidity > 0 || position.operator != address(0), "Invalid token ID");

        liquidity = uint128(params.amount0Desired);
        amount0 = params.amount0Desired;
        amount1 = params.amount1Desired;

        position.liquidity += liquidity;

        emit IncreaseLiquidity(params.tokenId, liquidity, amount0, amount1);
    }

    function decreaseLiquidity(DecreaseLiquidityParams calldata params)
        external
        payable
        returns (uint256 amount0, uint256 amount1)
    {
        require(params.deadline >= block.timestamp, "Expired");
        Position storage position = positions[params.tokenId];
        require(position.liquidity >= params.liquidity, "Insufficient liquidity");

        position.liquidity -= params.liquidity;
        
        amount0 = uint256(params.liquidity);
        amount1 = uint256(params.liquidity);

        emit DecreaseLiquidity(params.tokenId, params.liquidity, amount0, amount1);
    }

    function collect(CollectParams calldata params) 
        external 
        payable 
        returns (uint256 amount0, uint256 amount1) 
    {
        Position storage position = positions[params.tokenId];
        require(position.operator != address(0), "Invalid token ID");

        amount0 = uint256(params.amount0Max);
        amount1 = uint256(params.amount1Max);

        emit Collect(params.tokenId, amount0, amount1);
    }
} 