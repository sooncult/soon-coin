const { expect } = require("chai");
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");

describe("SOON Token", function () {
  let soon;
  let owner;
  let addr1;
  let addr2;
  let addrs;
  const TOTAL_SUPPLY = ethers.utils.parseEther("6942000000"); // 6.942 billion tokens
  const TAX_RATE = 690; // 6.9%
  const REFLECTION_FEE = 333; // 3.33%
  const BURN_FEE = 200; // 2%
  const LIQUIDITY_FEE = 157; // 1.57%

  beforeEach(async function () {
    [owner, addr1, addr2, ...addrs] = await ethers.getSigners();
    const SOON = await ethers.getContractFactory("SOON");
    soon = await SOON.deploy();
    await soon.deployed();
    // Verify that the deployer (owner) has the full initial supply
    expect(await soon.balanceOf(owner.address)).to.equal(TOTAL_SUPPLY);
  });

  describe("Token Fundamentals", function () {
    it("Should have correct name and symbol", async function () {
      expect(await soon.name()).to.equal("SOON");
      expect(await soon.symbol()).to.equal("SOON");
    });

    it("Should have correct total supply: 6,942,000,000", async function () {
      expect(await soon.totalSupply()).to.equal(TOTAL_SUPPLY);
    });

    it("Should initially assign all tokens to the deployer", async function () {
      expect(await soon.balanceOf(owner.address)).to.equal(TOTAL_SUPPLY);
    });
  });

  describe("Tax Mechanics", function () {
    it("Should have the right tax rates", async function () {
      expect(await soon.taxRateBIPS()).to.equal(TAX_RATE);
      expect(await soon.reflectionFeeBIPS()).to.equal(REFLECTION_FEE);
      expect(await soon.burnFeeBIPS()).to.equal(BURN_FEE);
      expect(await soon.liquidityFeeBIPS()).to.equal(LIQUIDITY_FEE);
    });

    it("Should apply tax on transfers between normal addresses", async function () {
      const transferAmount = ethers.utils.parseEther("1000");
      const taxAmount = transferAmount.mul(TAX_RATE).div(10000);
      const expectedAmount = transferAmount.sub(taxAmount);

      await soon.transfer(addr1.address, transferAmount);
      await soon.connect(addr1).transfer(addr2.address, transferAmount);

      expect(await soon.balanceOf(addr2.address)).to.equal(expectedAmount);
    });

    it("Should not apply tax when sender is excluded from fee", async function () {
      const transferAmount = ethers.utils.parseEther("1000");
      await soon.excludeFromFee(addr1.address, true);
      await soon.transfer(addr1.address, transferAmount);
      await soon.connect(addr1).transfer(addr2.address, transferAmount);
      expect(await soon.balanceOf(addr2.address)).to.equal(transferAmount);
    });

    it("Should not apply tax when recipient is excluded from fee", async function () {
      const transferAmount = ethers.utils.parseEther("1000");
      await soon.excludeFromFee(addr2.address, true);
      await soon.transfer(addr1.address, transferAmount);
      await soon.connect(addr1).transfer(addr2.address, transferAmount);
      expect(await soon.balanceOf(addr2.address)).to.equal(transferAmount);
    });
  });

  describe("Reflection Mechanics", function () {
    it("Should exclude and include addresses from rewards", async function () {
      await soon.excludeFromReward(addr1.address, true);
      expect(await soon.isExcludedFromReward(addr1.address)).to.be.true;
      
      await soon.excludeFromReward(addr1.address, false);
      expect(await soon.isExcludedFromReward(addr1.address)).to.be.false;
    });

    it("Should distribute reflection rewards correctly", async function () {
      const transferAmount = ethers.utils.parseEther("1000");
      const taxAmount = transferAmount.mul(TAX_RATE).div(10000);
      const reflectionAmount = taxAmount.mul(REFLECTION_FEE).div(TAX_RATE);
      
      // Transfer tokens to create reflection
      await soon.transfer(addr1.address, transferAmount);
      await soon.transfer(addr2.address, transferAmount);
      
      // Check reflection distribution
      const balanceBefore = await soon.balanceOf(addr2.address);
      await soon.connect(addr1).transfer(addr2.address, transferAmount);
      const balanceAfter = await soon.balanceOf(addr2.address);
      
      // Balance should increase more than just the transfer amount due to reflection
      expect(balanceAfter.sub(balanceBefore)).to.be.gt(transferAmount.sub(taxAmount));
    });
  });

  describe("Ownership Functions", function () {
    it("Should update tax rates correctly", async function () {
      const newTaxRate = 500; // 5%
      const newReflectionFee = 300; // 3%
      const newBurnFee = 100; // 1%
      const newLiquidityFee = 100; // 1%
      
      await soon.updateTaxSettings(
        newTaxRate,
        newReflectionFee,
        newBurnFee,
        newLiquidityFee
      );
      
      expect(await soon.taxRateBIPS()).to.equal(newTaxRate);
      expect(await soon.reflectionFeeBIPS()).to.equal(newReflectionFee);
      expect(await soon.burnFeeBIPS()).to.equal(newBurnFee);
      expect(await soon.liquidityFeeBIPS()).to.equal(newLiquidityFee);
    });

    it("Should prevent non-owner from calling owner functions", async function () {
      await expect(
        soon.connect(addr1).updateTaxSettings(500, 300, 100, 100)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should allow transferring ownership", async function () {
      await soon.transferOwnership(addr1.address);
      expect(await soon.owner()).to.equal(addr1.address);
    });
  });

  describe("Emergency Recovery Functions", function () {
    it("Should rescue trapped ERC20 tokens", async function () {
      const MockToken = await ethers.getContractFactory("MockERC20");
      const mockToken = await MockToken.deploy("Mock", "MOCK");
      await mockToken.deployed();
      
      const amount = ethers.utils.parseEther("1000");
      await mockToken.mint(soon.address, amount);
      
      await soon.rescueERC20(mockToken.address, owner.address, amount);
      expect(await mockToken.balanceOf(owner.address)).to.equal(amount);
    });

    it("Should prevent rescuing SOON token itself", async function () {
      await expect(
        soon.rescueERC20(soon.address, owner.address, 1000)
      ).to.be.revertedWith("SOON: Cannot rescue self token");
    });
  });
}); 