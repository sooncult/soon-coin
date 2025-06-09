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
    const MockOracle = await ethers.getContractFactory("MockOracle");
    mockOracle = await MockOracle.deploy();
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

    // Deploy LiquidityManager with mock oracle (test mode)
    const LiquidityManager = await ethers.getContractFactory("LiquidityManager");
    liquidityManager = await LiquidityManager.deploy(
      soon.address,
      weth.address,
      positionManager.address,
      ethers.constants.AddressZero // mock mode
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
      expect(await liquidityManager.usdc()).to.equal(usdc.address);
    });

    it("Should set the correct router and factory addresses", async function () {
      expect(await liquidityManager.sushiRouter()).to.equal(sushiRouter.address);
      expect(await liquidityManager.sushiFactory()).to.equal(sushiFactory.address);
    });

    it("Should initialize with zero position token ID", async function () {
      expect(await liquidityManager.positionTokenId()).to.equal(0);
    });
  });

  describe("Position Management", function () {
    it("Should create initial position", async function () {
      await liquidityManager.createInitialPosition();
      expect(await liquidityManager.positionTokenId()).to.not.equal(0);
    });

    it("Should rebalance position around TWAP", async function () {
      await liquidityManager.createInitialPosition();
      const positionId = await liquidityManager.positionTokenId();
      
      // Set mock oracle price
      await mockOracle.setPrice(ethers.utils.parseUnits("2000", 6)); // $2000 per ETH
      
      // Rebalance position
      await liquidityManager.rebalancePosition();
      
      // Verify new position was created
      expect(await liquidityManager.positionTokenId()).to.not.equal(positionId);
    });

    it("Should respect rate limiting in production mode", async function () {
      await liquidityManager.createInitialPosition();
      
      // First rebalance should succeed
      await liquidityManager.rebalancePosition();
      
      // Second rebalance should fail due to rate limiting
      await expect(
        liquidityManager.rebalancePosition()
      ).to.be.revertedWith("Too soon");
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

  describe("Slippage Protection", function () {
    it("Should respect minimum slippage tolerance", async function () {
      await liquidityManager.createInitialPosition();
      
      // Set extreme price movement
      await mockOracle.setPrice(ethers.utils.parseUnits("1000", 6)); // 50% price drop
      
      // Rebalance should fail due to slippage
      await expect(
        liquidityManager.rebalancePosition()
      ).to.be.revertedWith("Slippage too high");
    });

    it("Should calculate dynamic slippage based on TWAP", async function () {
      await liquidityManager.createInitialPosition();
      
      // Set moderate price movement
      await mockOracle.setPrice(ethers.utils.parseUnits("1800", 6)); // 10% price drop
      
      // Rebalance should succeed with dynamic slippage
      await liquidityManager.rebalancePosition();
    });
  });

  describe("Emergency Functions", function () {
    it("Should allow owner to rescue tokens", async function () {
      const amount = ethers.utils.parseEther("1000");
      await soon.transfer(liquidityManager.address, amount);
      
      await liquidityManager.rescueTokens(soon.address, owner.address, amount);
      expect(await soon.balanceOf(owner.address)).to.equal(amount);
    });

    it("Should prevent non-owner from rescuing tokens", async function () {
      await expect(
        liquidityManager.connect(addr1).rescueTokens(soon.address, addr1.address, 1000)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
}); 