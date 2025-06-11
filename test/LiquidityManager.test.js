const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

describe("LiquidityManager", function () {
  let liquidityManager;
  let soon;
  let mockOracle;
  let owner;
  let addr1;
  let addr2;
  let sushiRouter;
  let sushiFactory;
  let weth;
  let usdc;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    // Deploy mock tokens
    const MockToken = await ethers.getContractFactory("MockERC20");
    weth = await MockToken.deploy("Wrapped ETH", "WETH");
    usdc = await MockToken.deploy("USD Coin", "USDC");
    await weth.deployed();
    await usdc.deployed();

    // Deploy SOON token
    const SOON = await ethers.getContractFactory("SOON");
    soon = await SOON.deploy();
    await soon.deployed();

    // Deploy mock oracle
    const MockPoolOracle = await ethers.getContractFactory("MockPoolOracle");
    mockOracle = await MockPoolOracle.deploy();
    await mockOracle.deployed();

    // Deploy SushiSwap router and factory
    const SushiRouter = await ethers.getContractFactory("MockSushiRouter");
    const SushiFactory = await ethers.getContractFactory("MockSushiFactory");
    sushiRouter = await SushiRouter.deploy();
    sushiFactory = await SushiFactory.deploy();
    await sushiRouter.deployed();
    await sushiFactory.deployed();

    // Deploy NonfungiblePositionManager mock
    const NonfungiblePositionManager = await ethers.getContractFactory("NonfungiblePositionManager");
    const positionManager = await NonfungiblePositionManager.deploy(owner.address, weth.address, owner.address);
    await positionManager.deployed();

    // Deploy MockLiquidityManager for testing
    const MockLiquidityManager = await ethers.getContractFactory("MockLiquidityManager");
    liquidityManager = await MockLiquidityManager.deploy(
      soon.address,
      weth.address,
      positionManager.address
    );
    await liquidityManager.deployed();

    // Set up initial liquidity
    await weth.mint(liquidityManager.address, ethers.utils.parseEther("100"));
    await soon.transfer(liquidityManager.address, ethers.utils.parseEther("1000000"));
  });

  describe("Deployment", function () {
    it("Should set the correct token addresses", async function () {
      expect(await liquidityManager.soonToken()).to.equal(soon.address);
      expect(await liquidityManager.weth()).to.equal(weth.address);
    });

    it("Should initialize with zero position token ID", async function () {
      expect(await liquidityManager.positionTokenId()).to.equal(0);
    });

    it("Should be in mock mode by default", async function () {
      expect(await liquidityManager.isMockMode()).to.equal(true);
    });
  });

  describe("Position Management", function () {
    it("Should create initial position", async function () {
      await liquidityManager.createInitialPosition();
      expect(await liquidityManager.positionTokenId()).to.not.equal(0);
    });

    it("Should rebalance position", async function () {
      await liquidityManager.createInitialPosition();
      const positionId = await liquidityManager.positionTokenId();
      
      // Set mock oracle price
      await liquidityManager.setMockOraclePrice(100, ethers.utils.parseUnits("2", 96));
      
      // Rebalance position
      await liquidityManager.rebalancePosition();
      
      // Verify new position was created
      expect(await liquidityManager.positionTokenId()).to.not.equal(0);
    });

    it("Should respect rate limiting in production mode", async function () {
      await liquidityManager.createInitialPosition();
      await liquidityManager.setMockMode(false);
      
      // First rebalance should succeed
      await liquidityManager.rebalancePosition();
      
      // Second rebalance should fail due to rate limiting
      await expect(
        liquidityManager.rebalancePosition()
      ).to.be.revertedWith("LM: Too soon to rebalance");
    });

    it("Should allow consecutive rebalances in test mode", async function () {
      await liquidityManager.setMockMode(true);
      await liquidityManager.createInitialPosition();
      
      // Multiple rebalances should succeed in test mode
      await liquidityManager.rebalancePosition();
      await liquidityManager.rebalancePosition();
      await liquidityManager.rebalancePosition();
    });
  });

  describe("Owner Functions", function () {
    it("Should update tick distance", async function () {
      await liquidityManager.updateTickDistance(1500);
      expect(await liquidityManager.tickDistance()).to.equal(1500);
    });

    it("Should update TWAP interval", async function () {
      await liquidityManager.updateTwapInterval(3600);
      expect(await liquidityManager.twapIntervalSeconds()).to.equal(3600);
    });

    it("Should lock the contract", async function () {
      await liquidityManager.lock();
      expect(await liquidityManager.isLocked()).to.equal(true);
      
      // Should not be able to update settings after lock
      await expect(
        liquidityManager.updateTickDistance(1000)
      ).to.be.revertedWith("LM: Contract is locked");
    });
  });

  describe("Emergency Functions", function () {
    it("Should allow owner to rescue tokens", async function () {
      const MockToken = await ethers.getContractFactory("MockERC20");
      const testToken = await MockToken.deploy("Test", "TEST");
      await testToken.deployed();
      
      const amount = ethers.utils.parseEther("1000");
      await testToken.mint(liquidityManager.address, amount);
      
      const ownerBalanceBefore = await testToken.balanceOf(owner.address);
      await liquidityManager.rescueTokens(testToken.address, amount, owner.address);
      const ownerBalanceAfter = await testToken.balanceOf(owner.address);
      
      expect(ownerBalanceAfter.sub(ownerBalanceBefore)).to.equal(amount);
    });

    it("Should not allow rescuing SOON or RBTC", async function () {
      await expect(
        liquidityManager.rescueTokens(soon.address, 1000, owner.address)
      ).to.be.revertedWith("LM: Cannot rescue SOON or RBTC");
      
      await expect(
        liquidityManager.rescueTokens(weth.address, 1000, owner.address)
      ).to.be.revertedWith("LM: Cannot rescue SOON or RBTC");
    });

    it("Should prevent non-owner from rescuing tokens", async function () {
      await expect(
        liquidityManager.connect(addr1).rescueTokens(usdc.address, 1000, addr1.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
}); 