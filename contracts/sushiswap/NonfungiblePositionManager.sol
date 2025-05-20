// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract NonfungiblePositionManager is ERC721, Ownable {
    struct Position {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
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

    function mint(
        address token0,
        address token1,
        uint24 fee,
        int24 tickLower,
        int24 tickUpper,
        uint256 amount0Desired,
        uint256 amount1Desired,
        uint256 amount0Min,
        uint256 amount1Min,
        address recipient,
        uint256 deadline
    ) external returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1) {
        require(deadline >= block.timestamp, "Expired");
        require(token0 < token1, "Token order");

        tokenId = _nextId++;
        _mint(recipient, tokenId);

        // Initialize the position storage slots
        positions[tokenId].token0 = token0;
        positions[tokenId].token1 = token1;
        positions[tokenId].fee = fee;
        positions[tokenId].tickLower = tickLower;
        positions[tokenId].tickUpper = tickUpper;
        positions[tokenId].liquidity = 0;

        liquidity = uint128(amount0Desired);
        amount0 = amount0Desired;
        amount1 = amount1Desired;

        emit IncreaseLiquidity(tokenId, liquidity, amount0, amount1);
    }

    function increaseLiquidity(
        uint256 tokenId,
        uint256 amount0Desired,
        uint256 amount1Desired,
        uint256 amount0Min,
        uint256 amount1Min,
        uint256 deadline
    ) external returns (uint128 liquidity, uint256 amount0, uint256 amount1) {
        require(deadline >= block.timestamp, "Expired");
        Position storage position = positions[tokenId];
        require(position.liquidity > 0, "No position");

        liquidity = uint128(amount0Desired);
        amount0 = amount0Desired;
        amount1 = amount1Desired;

        emit IncreaseLiquidity(tokenId, liquidity, amount0, amount1);
    }

    function decreaseLiquidity(
        uint256 tokenId,
        uint128 liquidity,
        uint256 amount0Min,
        uint256 amount1Min,
        uint256 deadline
    ) external returns (uint256 amount0, uint256 amount1) {
        require(deadline >= block.timestamp, "Expired");
        Position storage position = positions[tokenId];
        require(position.liquidity >= liquidity, "Insufficient liquidity");

        amount0 = uint256(liquidity);
        amount1 = uint256(liquidity);

        emit DecreaseLiquidity(tokenId, liquidity, amount0, amount1);
    }

    function collect(
        uint256 tokenId,
        address recipient,
        uint128 amount0Max,
        uint128 amount1Max
    ) external returns (uint256 amount0, uint256 amount1) {
        Position storage position = positions[tokenId];
        require(position.liquidity > 0, "No position");

        amount0 = amount0Max;
        amount1 = amount1Max;

        emit Collect(tokenId, amount0, amount1);
    }
} 