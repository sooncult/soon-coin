const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LiquidityManager", function () {
  let soon, weth, factory, positionManager, liquidityManager;
  let owner, addr1, addr2;
  
  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();
    
    // Deploy SOON token
    const SOON = await ethers.getContractFactory("SOON");
    soon = await SOON.deploy();
    await soon.deployed();
    
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
    
    // Create SOON/WETH pool in the factory
    await factory.createPool(soon.address, weth.address, 3000);
    const poolAddress = await factory.getPool(soon.address, weth.address, 3000);
    
    // Run tests with both mock mode and with real pool to ensure both work
    if (process.env.TEST_WITH_REAL_POOL === 'true') {
      // Test with real pool address
      const LiquidityManager = await ethers.getContractFactory("LiquidityManager");
      liquidityManager = await LiquidityManager.deploy(
        soon.address,
        weth.address,
        positionManager.address,
        poolAddress // Use real pool address
      );
      await liquidityManager.deployed();
    } else {
      // Test with mock mode (default)
      const LiquidityManager = await ethers.getContractFactory("LiquidityManager");
      liquidityManager = await LiquidityManager.deploy(
        soon.address,
        weth.address,
        positionManager.address,
        ethers.constants.AddressZero // Use address(0) for mock mode
      );
      await liquidityManager.deployed();
    }
    
    // Transfer SOON tokens to LiquidityManager
    await soon.transfer(liquidityManager.address, ethers.utils.parseEther("347100000")); // 5% of supply
    
    // Deposit ETH to get WETH for liquidity
    await weth.deposit({ value: ethers.utils.parseEther("100") });
    await weth.transfer(liquidityManager.address, ethers.utils.parseEther("100"));
  });

  describe("Deployment", function() {
    it("Should set the correct token addresses", async function () {
      expect(await liquidityManager.soonToken()).to.equal(soon.address);
      expect(await liquidityManager.rbtcToken()).to.equal(weth.address);
      expect(await liquidityManager.positionManager()).to.equal(positionManager.address);
      
      // Check oracle mode based on environment variable
      if (process.env.TEST_WITH_REAL_POOL === 'true') {
        // Real pool test
        expect(await liquidityManager.isMockMode()).to.equal(false);
        expect(await liquidityManager.sushiPoolOracle()).to.not.equal(liquidityManager.address);
      } else {
        // Mock mode test (default)
        expect(await liquidityManager.isMockMode()).to.equal(true);
        expect(await liquidityManager.sushiPoolOracle()).to.equal(liquidityManager.address);
      }
    });
    
    it("Should set the default parameters", async function () {
      expect(await liquidityManager.tickDistance()).to.equal(2000);
      expect(await liquidityManager.twapIntervalSeconds()).to.equal(1800);
      expect(await liquidityManager.isLocked()).to.equal(false);
      expect(await liquidityManager.positionTokenId()).to.equal(0);
    });
    
    it("Should have the correct token balances", async function () {
      expect(await soon.balanceOf(liquidityManager.address)).to.equal(ethers.utils.parseEther("347100000"));
      expect(await weth.balanceOf(liquidityManager.address)).to.equal(ethers.utils.parseEther("100"));
    });
  });
  
  describe("Position Initialization", function() {
    it("Should initialize a liquidity position", async function () {
      const soonAmount = ethers.utils.parseEther("10000000");
      const wethAmount = ethers.utils.parseEther("10");
      
      // Position not initialized yet
      expect(await liquidityManager.positionTokenId()).to.equal(0);
      
      // Initialize position
      await liquidityManager.initializePosition(
        soonAmount,
        wethAmount,
        0 // Target tick (at price = 1.0)
      );
      
      // Position should be initialized with a token ID > 0
      expect(await liquidityManager.positionTokenId()).to.be.gt(0);
    });
    
    it("Should prevent non-owner from initializing position", async function () {
      const soonAmount = ethers.utils.parseEther("10000000");
      const wethAmount = ethers.utils.parseEther("10");
      
      await expect(
        liquidityManager.connect(addr1).initializePosition(
          soonAmount,
          wethAmount,
          0
        )
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
    
    it("Should prevent initializing with zero amounts", async function () {
      await expect(
        liquidityManager.initializePosition(0, ethers.utils.parseEther("10"), 0)
      ).to.be.revertedWith("LM: Amounts must be positive");
      
      await expect(
        liquidityManager.initializePosition(ethers.utils.parseEther("10000000"), 0, 0)
      ).to.be.revertedWith("LM: Amounts must be positive");
    });
    
    it("Should prevent initializing more than once", async function () {
      const soonAmount = ethers.utils.parseEther("10000000");
      const wethAmount = ethers.utils.parseEther("10");
      
      // First initialization
      await liquidityManager.initializePosition(
        soonAmount,
        wethAmount,
        0
      );
      
      // Second initialization should fail
      await expect(
        liquidityManager.initializePosition(
          soonAmount,
          wethAmount,
          0
        )
      ).to.be.revertedWith("LM: Position already initialized");
    });
  });
  
  describe("Position Rebalancing", function() {
    beforeEach(async function () {
      // Initialize position first
      await liquidityManager.initializePosition(
        ethers.utils.parseEther("10000000"),
        ethers.utils.parseEther("10"),
        0
      );
    });
    
    it("Should allow anyone to rebalance position", async function () {
      // Non-owner should be able to call rebalance
      await liquidityManager.connect(addr1).rebalancePosition();
    });
    
    it("Should collect fees when rebalancing", async function () {
      // Call rebalance to collect fees (in this mock implementation it won't actually collect anything)
      const tx = await liquidityManager.rebalancePosition();
      
      // Check for FeesCollected event
      const receipt = await tx.wait();
      const feesCollectedEvent = receipt.events.find(e => e.event === 'FeesCollected');
      expect(feesCollectedEvent).to.not.be.undefined;
    });
    
    it("Should rebalance based on TWAP", async function () {
      // In our mock implementation, the TWAP oracle just returns 0
      // So this test just checks that the function doesn't revert
      await liquidityManager.rebalancePosition();
    });
  });
  
  describe("Configuration", function() {
    it("Should allow owner to update tick distance", async function () {
      await liquidityManager.updateTickDistance(1500);
      expect(await liquidityManager.tickDistance()).to.equal(1500);
    });
    
    it("Should allow owner to update TWAP interval", async function () {
      await liquidityManager.updateTwapInterval(3600);
      expect(await liquidityManager.twapIntervalSeconds()).to.equal(3600);
    });
    
    it("Should prevent non-owner from updating parameters", async function () {
      await expect(
        liquidityManager.connect(addr1).updateTickDistance(1500)
      ).to.be.revertedWith("Ownable: caller is not the owner");
      
      await expect(
        liquidityManager.connect(addr1).updateTwapInterval(3600)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
    
    it("Should validate parameter values", async function () {
      await expect(
        liquidityManager.updateTickDistance(0)
      ).to.be.revertedWith("LM: Invalid tick distance");
      
      await expect(
        liquidityManager.updateTickDistance(25000)
      ).to.be.revertedWith("LM: Invalid tick distance");
      
      await expect(
        liquidityManager.updateTwapInterval(500)
      ).to.be.revertedWith("LM: Invalid TWAP interval");
      
      await expect(
        liquidityManager.updateTwapInterval(90000)
      ).to.be.revertedWith("LM: Invalid TWAP interval");
    });
  });
  
  describe("Locking", function() {
    it("Should allow owner to lock the contract", async function () {
      expect(await liquidityManager.isLocked()).to.equal(false);
      
      await liquidityManager.lock();
      
      expect(await liquidityManager.isLocked()).to.equal(true);
    });
    
    it("Should prevent non-owner from locking the contract", async function () {
      await expect(
        liquidityManager.connect(addr1).lock()
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
    
    it("Should prevent updating parameters after locking", async function () {
      await liquidityManager.lock();
      
      await expect(
        liquidityManager.updateTickDistance(1500)
      ).to.be.revertedWith("LM: Contract is locked");
      
      await expect(
        liquidityManager.updateTwapInterval(3600)
      ).to.be.revertedWith("LM: Contract is locked");
    });
    
    it("Should still allow rebalancing after locking", async function () {
      // Initialize position
      await liquidityManager.initializePosition(
        ethers.utils.parseEther("10000000"),
        ethers.utils.parseEther("10"),
        0
      );
      
      // Lock the contract
      await liquidityManager.lock();
      
      // Should still be able to rebalance
      await liquidityManager.rebalancePosition();
    });
  });
  
  describe("Emergency Functions", function() {
    it("Should allow owner to rescue tokens", async function () {
      // Deploy test token
      const TestToken = await ethers.getContractFactory("SOON");
      const testToken = await TestToken.deploy();
      
      // Send some to the liquidity manager
      await testToken.transfer(liquidityManager.address, ethers.utils.parseEther("1000"));
      
      // Rescue tokens
      await liquidityManager.rescueTokens(
        testToken.address,
        ethers.utils.parseEther("1000"),
        owner.address
      );
      
      // Tokens should be rescued
      expect(await testToken.balanceOf(owner.address)).to.equal(
        ethers.utils.parseEther("6942000000")
      );
    });
    
    it("Should prevent rescuing SOON or RBTC tokens", async function () {
      await expect(
        liquidityManager.rescueTokens(
          soon.address,
          ethers.utils.parseEther("1000"),
          owner.address
        )
      ).to.be.revertedWith("LM: Cannot rescue SOON or RBTC");
      
      await expect(
        liquidityManager.rescueTokens(
          weth.address,
          ethers.utils.parseEther("10"),
          owner.address
        )
      ).to.be.revertedWith("LM: Cannot rescue SOON or RBTC");
    });
    
    it("Should allow owner to rescue native RBTC", async function () {
      // Send some ETH to the liquidity manager
      await owner.sendTransaction({
        to: liquidityManager.address,
        value: ethers.utils.parseEther("1")
      });
      
      // Get initial balance
      const initialBalance = await ethers.provider.getBalance(owner.address);
      
      // Rescue RBTC
      await liquidityManager.rescueRBTC(owner.address);
      
      // Balance should increase by ~1 ETH (minus gas)
      const finalBalance = await ethers.provider.getBalance(owner.address);
      expect(finalBalance.sub(initialBalance)).to.be.gt(
        ethers.utils.parseEther("0.9")
      );
    });
    
    it("Should prevent non-owner from rescuing tokens", async function () {
      await expect(
        liquidityManager.connect(addr1).rescueTokens(
          ethers.constants.AddressZero,
          ethers.utils.parseEther("1000"),
          addr1.address
        )
      ).to.be.revertedWith("Ownable: caller is not the owner");
      
      await expect(
        liquidityManager.connect(addr1).rescueRBTC(addr1.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
    
    it("Should prevent rescuing after locking", async function () {
      await liquidityManager.lock();
      
      await expect(
        liquidityManager.rescueTokens(
          ethers.constants.AddressZero,
          ethers.utils.parseEther("1000"),
          owner.address
        )
      ).to.be.revertedWith("LM: Contract is locked");
      
      await expect(
        liquidityManager.rescueRBTC(owner.address)
      ).to.be.revertedWith("LM: Contract is locked");
    });
  });
  
  // Add tests specifically for mock oracle functions
  describe("Oracle Functions", function() {
    it("Should allow calling mock oracle functions in mock mode", async function () {
      // Skip test if using real pool
      if (process.env.TEST_WITH_REAL_POOL === 'true') {
        this.skip();
        return;
      }
      
      const secondsAgos = [1800, 0];
      const [tickCumulatives, secondsPerLiquidityCumulativeX128s] = 
        await liquidityManager.observe(secondsAgos);
      
      expect(tickCumulatives.length).to.equal(2);
      expect(secondsPerLiquidityCumulativeX128s.length).to.equal(2);
      
      const slot0Data = await liquidityManager.slot0();
      expect(slot0Data.tick).to.equal(0);
      expect(slot0Data.unlocked).to.equal(true);
    });
    
    it("Should revert when calling mock functions with real pool", async function () {
      // Skip test if using mock mode
      if (process.env.TEST_WITH_REAL_POOL !== 'true') {
        this.skip();
        return;
      }
      
      const secondsAgos = [1800, 0];
      await expect(
        liquidityManager.observe(secondsAgos)
      ).to.be.revertedWith("LM: Not in mock mode");
      
      await expect(
        liquidityManager.slot0()
      ).to.be.revertedWith("LM: Not in mock mode");
    });
  });
}); 