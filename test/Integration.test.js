const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

describe("SOON Ecosystem Integration", function () {
  let soon;
  let liquidityManager;
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

    // Deploy WETH9 first so 'weth' is available for all subsequent uses
    const WETH9 = await ethers.getContractFactory("WETH9");
    const weth = await WETH9.deploy();
    await weth.deployed();

    // Deploy mock tokens (if needed)
    // const MockToken = await ethers.getContractFactory("MockERC20");
    // usdc = await MockToken.deploy("USD Coin", "USDC");
    // await usdc.deployed();

    // Deploy SOON token
    const SOON = await ethers.getContractFactory("SOON");
    soon = await SOON.deploy();
    await soon.deployed();

    // Deploy mock oracle
    const MockOracle = await ethers.getContractFactory("MockOracle");
    mockOracle = await MockOracle.deploy();
    await mockOracle.deployed();

    // Deploy SushiSwap V3 Factory
    const SushiSwapV3Factory = await ethers.getContractFactory("SushiSwapV3Factory");
    const factory = await SushiSwapV3Factory.deploy();
    await factory.deployed();

    // Deploy Nonfungible Position Manager
    const NonfungiblePositionManager = await ethers.getContractFactory("NonfungiblePositionManager");
    const positionManager = await NonfungiblePositionManager.deploy(
      factory.address,
      weth.address,
      owner.address
    );
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
    await weth.deposit({ value: ethers.utils.parseEther("100") });
    await weth.transfer(liquidityManager.address, ethers.utils.parseEther("100"));
    await soon.transfer(liquidityManager.address, ethers.utils.parseEther("1000000"));

    // Set LiquidityManager in SOON token
    await soon.setLiquidityManager(liquidityManager.address);
  });

  describe("Full Lifecycle", function () {
    it("Should handle user claim, transfer, and LP rebalance", async function () {
      // 1. User claims tokens
      const claimAmount = ethers.utils.parseEther("1000");
      await soon.transfer(addr1.address, claimAmount);
      expect(await soon.balanceOf(addr1.address)).to.equal(claimAmount);

      // 2. User transfers tokens (tax applied)
      const transferAmount = ethers.utils.parseEther("100");
      await soon.connect(addr1).transfer(addr2.address, transferAmount);
      
      // Check tax was applied
      const taxAmount = transferAmount.mul(69).div(1000); // 6.9% tax
      const expectedReceived = transferAmount.sub(taxAmount);
      expect(await soon.balanceOf(addr2.address)).to.equal(expectedReceived);

      // 3. LiquidityManager rebalances position
      await liquidityManager.createInitialPosition();
      await mockOracle.setPrice(ethers.utils.parseUnits("2000", 6));
      await liquidityManager.rebalancePosition();

      // Verify new position was created
      expect(await liquidityManager.positionTokenId()).to.not.equal(0);
    });

    it("Should handle multiple transfers and rebalances", async function () {
      // Set up initial positions
      await liquidityManager.createInitialPosition();
      await soon.transfer(addr1.address, ethers.utils.parseEther("10000"));
      await soon.transfer(addr2.address, ethers.utils.parseEther("10000"));

      // Perform multiple transfers
      for (let i = 0; i < 3; i++) {
        await soon.connect(addr1).transfer(addr2.address, ethers.utils.parseEther("100"));
        await soon.connect(addr2).transfer(addr1.address, ethers.utils.parseEther("100"));
      }

      // Rebalance with different prices
      const prices = ["1800", "2000", "2200"];
      for (const price of prices) {
        await mockOracle.setPrice(ethers.utils.parseUnits(price, 6));
        await liquidityManager.rebalancePosition();
      }
    });

    it("Should handle emergency scenarios", async function () {
      // Set up initial position
      await liquidityManager.createInitialPosition();

      // Simulate emergency by sending tokens to LiquidityManager
      const emergencyAmount = ethers.utils.parseEther("1000");
      await soon.transfer(liquidityManager.address, emergencyAmount);

      // Rescue tokens
      await liquidityManager.rescueTokens(soon.address, owner.address, emergencyAmount);
      expect(await soon.balanceOf(owner.address)).to.equal(emergencyAmount);
    });
  });

  describe("Slippage Protection", function () {
    it("Should protect against extreme price movements", async function () {
      await liquidityManager.createInitialPosition();

      // Set extreme price movement
      await mockOracle.setPrice(ethers.utils.parseUnits("1000", 6)); // 50% drop

      // Rebalance should fail due to slippage
      await expect(
        liquidityManager.rebalancePosition()
      ).to.be.revertedWith("Slippage too high");
    });

    it("Should handle moderate price movements", async function () {
      await liquidityManager.createInitialPosition();

      // Set moderate price movement
      await mockOracle.setPrice(ethers.utils.parseUnits("1900", 6)); // 5% drop

      // Rebalance should succeed
      await liquidityManager.rebalancePosition();
    });
  });

  describe("Rate Limiting", function () {
    it("Should respect rate limiting in production", async function () {
      await liquidityManager.createInitialPosition();

      // First rebalance succeeds
      await liquidityManager.rebalancePosition();

      // Second rebalance fails
      await expect(
        liquidityManager.rebalancePosition()
      ).to.be.revertedWith("Too soon");
    });

    it("Should allow consecutive rebalances in test mode", async function () {
      await liquidityManager.setMockMode(true);
      await liquidityManager.createInitialPosition();

      // Multiple rebalances should succeed
      await liquidityManager.rebalancePosition();
      await liquidityManager.rebalancePosition();
      await liquidityManager.rebalancePosition();
    });
  });
}); 