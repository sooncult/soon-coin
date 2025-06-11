// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MockSushiFactory {
    function getPair(address, address) external pure returns (address pair) {
        return address(0x1);
    }

    function createPair(address, address) external pure returns (address pair) {
        return address(0x1);
    }
} 