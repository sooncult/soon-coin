// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MockOracle {
    uint256 private price;

    function setPrice(uint256 _price) external {
        price = _price;
    }

    function getPrice() external view returns (uint256) {
        return price;
    }

    function getLatestPrice() external view returns (uint256) {
        return price;
    }

    function getDecimals() external pure returns (uint8) {
        return 6;
    }
} 