const { expect } = require("chai");
const { ethers } = require("hardhat");
const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');

function createMerkleTree(claims) {
  const leaves = claims.map(claim => 
    ethers.utils.solidityKeccak256(
      ['address', 'uint256'],
      [claim.address, ethers.utils.parseEther(claim.amount)]
    )
  );
  
  const merkleTree = new MerkleTree(leaves, keccak256, { sortPairs: true });
  
  return {
    tree: merkleTree,
    root: merkleTree.getHexRoot(),
    getProof: (address, amount) => {
      const leaf = ethers.utils.solidityKeccak256(
        ['address', 'uint256'],
        [address, ethers.utils.parseEther(amount)]
      );
      return merkleTree.getHexProof(leaf);
    }
  };
}

describe("SOON Ecosystem Integration", function () {
  let soon, airdrop, factory, weth, positionManager, liquidityManager;
  let owner, user1, user2, user3;
  let merkleTree;
  
  const TOTAL_SUPPLY = ethers.utils.parseEther("6942000000");
  const AIRDROP_ALLOCATION = TOTAL_SUPPLY.mul(95).div(100); // 95% of supply
  const LIQUIDITY_ALLOCATION = TOTAL_SUPPLY.mul(5).div(100); // 5% of supply
  
  beforeEach(async function () {
    [owner, user1, user2, user3] = await ethers.getSigners();
    
    // Set up mock airdrop claims
    const claims = [
      { address: user1.address, amount: "1000000" },  // 1M tokens
      { address: user2.address, amount: "2000000" },  // 2M tokens
      { address: user3.address, amount: "3000000" }   // 3M tokens
    ];
    
    // Create Merkle tree for airdrop
    merkleTree = createMerkleTree(claims);
    
    // Deploy SOON token
    const SOON = await ethers.getContractFactory("SOON");
    soon = await SOON.deploy();
    await soon.deployed();
    
    // Deploy SOONAirdrop with Merkle root
    const SOONAirdrop = await ethers.getContractFactory("SOONAirdrop");
    airdrop = await SOONAirdrop.deploy(
      merkleTree.root,
      soon.address,
      30 // 30 days claim period
    );
    await airdrop.deployed();
    
    // Deploy WETH9 (mock RBTC)
    const WETH9 = await ethers.getContractFactory("WETH9");
    weth = await WETH9.deploy();
    await weth.deployed();
    
    // Deploy SushiSwapV3Factory
    const SushiSwapV3Factory = await ethers.getContractFactory("SushiSwapV3Factory");
    factory = await SushiSwapV3Factory.deploy();
    await factory.deployed();
    
    // Deploy NonfungiblePositionManager
    const NonfungiblePositionManager = await ethers.getContractFactory("NonfungiblePositionManager");
    positionManager = await NonfungiblePositionManager.deploy(
      factory.address,
      weth.address,
      owner.address
    );
    await positionManager.deployed();
    
    // Create pool in factory
    await factory.createPool(soon.address, weth.address, 3000);
    const poolAddress = await factory.getPool(soon.address, weth.address, 3000);
    
    // Deploy LiquidityManager in mock mode for testing
    const LiquidityManager = await ethers.getContractFactory("LiquidityManager");
    liquidityManager = await LiquidityManager.deploy(
      soon.address,
      weth.address,
      positionManager.address,
      ethers.constants.AddressZero // Use address(0) for mock mode
    );
    await liquidityManager.deployed();
    
    // Fund contracts with initial allocations
    await soon.transfer(airdrop.address, AIRDROP_ALLOCATION);
    await soon.transfer(liquidityManager.address, LIQUIDITY_ALLOCATION);
    
    // Get some WETH for liquidity
    await weth.deposit({ value: ethers.utils.parseEther("100") });
    await weth.transfer(liquidityManager.address, ethers.utils.parseEther("100"));
    
    // Configure SOON token's LiquidityManager
    await soon.setLiquidityManager(liquidityManager.address);
    
    // Exclude LiquidityManager from fees
    await soon.excludeFromFee(liquidityManager.address, true);
    
    // Initialize liquidity position
    await liquidityManager.initializePosition(
      LIQUIDITY_ALLOCATION.div(2), // Use half of the tokens for initial liquidity
      ethers.utils.parseEther("50"), // Use half of the WETH for initial liquidity
      0 // Target tick at 1.0
    );
  });

  describe("Full Lifecycle", function() {
    it("Should handle user claim, transfer, and LP rebalance", async function () {
      // 1. User claims tokens from airdrop
      await airdrop.connect(user1).claim(
        ethers.utils.parseEther("1000000"),
        merkleTree.getProof(user1.address, "1000000")
      );
      
      expect(await soon.balanceOf(user1.address)).to.equal(
        ethers.utils.parseEther("1000000")
      );
      
      // 2. User transfers some tokens (generating tax)
      const transferAmount = ethers.utils.parseEther("100000");
      await soon.connect(user1).transfer(user2.address, transferAmount);
      
      // Calculate expected tax amounts
      const taxRate = 690; // 6.9%
      const taxAmount = transferAmount.mul(taxRate).div(10000);
      const reflectionTax = transferAmount.mul(333).div(10000); // 3.33%
      const burnTax = transferAmount.mul(200).div(10000); // 2%
      const liquidityTax = transferAmount.mul(157).div(10000); // 1.57%
      
      const expectedReceived = transferAmount.sub(taxAmount);
      
      // Verify user2 received the correct amount (minus tax)
      expect(await soon.balanceOf(user2.address)).to.equal(expectedReceived);
      
      // Verify burn address received its share
      expect(await soon.balanceOf(await soon.burnAddress())).to.equal(burnTax);
      
      // Verify liquidity manager received its share
      expect(await soon.balanceOf(liquidityManager.address)).to.be.gt(
        LIQUIDITY_ALLOCATION.div(2) // Initial liquidity position used half
      );
      
      // Verify total supply reduced by burn amount
      expect(await soon.totalSupply()).to.equal(TOTAL_SUPPLY.sub(burnTax));
      
      // 3. Rebalance LP position (anyone can call)
      await liquidityManager.connect(user3).rebalancePosition();
      
      // 4. Lock liquidity manager (for permissionlessness)
      await liquidityManager.lock();
      expect(await liquidityManager.isLocked()).to.be.true;
      
      // 5. Verify LP position is still rebalanceable after locking
      await liquidityManager.connect(user1).rebalancePosition();
      
      // 6. Verify ownership can be renounced on all contracts
      await soon.transferOwnership(ethers.constants.AddressZero);
      await airdrop.transferOwnership(ethers.constants.AddressZero);
      
      // After renouncing ownership, no one should be able to call owner functions
      await expect(
        soon.setLiquidityManager(user1.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
      
      await expect(
        airdrop.updateMerkleRoot(ethers.constants.HashZero)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
    
    it("Should allow full airdrop distribution and recovery", async function () {
      // 1. Users claim their tokens
      for (const user of [user1, user2, user3]) {
        const amount = user === user1 ? "1000000" : user === user2 ? "2000000" : "3000000";
        await airdrop.connect(user).claim(
          ethers.utils.parseEther(amount),
          merkleTree.getProof(user.address, amount)
        );
      }
      
      // Verify all users got their tokens
      expect(await soon.balanceOf(user1.address)).to.equal(ethers.utils.parseEther("1000000"));
      expect(await soon.balanceOf(user2.address)).to.equal(ethers.utils.parseEther("2000000"));
      expect(await soon.balanceOf(user3.address)).to.equal(ethers.utils.parseEther("3000000"));
      
      // 2. Fast-forward to after claim period
      await ethers.provider.send("evm_increaseTime", [31 * 24 * 60 * 60]); // 31 days
      await ethers.provider.send("evm_mine");
      
      // 3. Recover unclaimed tokens
      const totalClaimed = ethers.utils.parseEther("6000000"); // Sum of all claims
      const expectedUnclaimed = AIRDROP_ALLOCATION.sub(totalClaimed);
      
      await airdrop.recoverUnclaimedTokens(owner.address);
      
      // Verify owner received the unclaimed tokens
      expect(await soon.balanceOf(owner.address)).to.equal(expectedUnclaimed);
      
      // Verify airdrop contract has 0 balance
      expect(await soon.balanceOf(airdrop.address)).to.equal(0);
    });
    
    it("Should provide initial liquidity with correct allocations", async function () {
      // Check allocation percentages
      expect(AIRDROP_ALLOCATION).to.equal(TOTAL_SUPPLY.mul(95).div(100));
      expect(LIQUIDITY_ALLOCATION).to.equal(TOTAL_SUPPLY.mul(5).div(100));
      
      // Check actual balances
      expect(await soon.balanceOf(airdrop.address)).to.equal(AIRDROP_ALLOCATION);
      
      // LiquidityManager balance should be ~half of its allocation (other half used for LP)
      const liquidityManagerBalance = await soon.balanceOf(liquidityManager.address);
      expect(liquidityManagerBalance).to.be.closeTo(
        LIQUIDITY_ALLOCATION.div(2),
        ethers.utils.parseEther("1") // Allow small rounding differences
      );
      
      // Check that LP position exists
      const positionId = await liquidityManager.positionTokenId();
      expect(positionId).to.be.gt(0);
    });
  });
}); 