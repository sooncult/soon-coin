const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("SOON Token", function () {
  let soon;
  let owner, addr1, addr2, addr3, liquidityManager;
  const TOTAL_SUPPLY = ethers.utils.parseEther("6942000000");
  
  beforeEach(async function () {
    [owner, addr1, addr2, addr3, liquidityManager] = await ethers.getSigners();
    
    const SOON = await ethers.getContractFactory("SOON");
    soon = await SOON.deploy();
    await soon.deployed();
    
    // Set liquidity manager for testing tax distribution
    await soon.setLiquidityManager(liquidityManager.address);
  });

  describe("Token Fundamentals", function() {
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
  
  describe("Tax Mechanics", function() {
    it("Should have the right tax rates", async function () {
      expect(await soon.taxRateBIPS()).to.equal(690); // 6.9%
      expect(await soon.reflectionFeeBIPS()).to.equal(333); // 3.33%
      expect(await soon.burnFeeBIPS()).to.equal(200); // 2%
      expect(await soon.liquidityFeeBIPS()).to.equal(157); // 1.57%
      
      // Verify sum of tax components equals total tax
      const reflectionFee = await soon.reflectionFeeBIPS();
      const burnFee = await soon.burnFeeBIPS();
      const liquidityFee = await soon.liquidityFeeBIPS();
      const totalTax = await soon.taxRateBIPS();
      
      expect(reflectionFee.add(burnFee).add(liquidityFee)).to.equal(totalTax);
    });
    
    it("Should apply tax on transfers between normal addresses", async function () {
      const transferAmount = ethers.utils.parseEther("1000");
      
      // Calculate expected amounts
      const taxAmount = transferAmount.mul(690).div(10000); // 6.9% tax
      const expectedReceived = transferAmount.sub(taxAmount);
      const burnAmount = transferAmount.mul(200).div(10000); // 2% burn
      const liquidityAmount = transferAmount.mul(157).div(10000); // 1.57% liquidity
      
      // Transfer from owner to addr1
      await soon.transfer(addr1.address, transferAmount);
      
      // Check balances after tax
      expect(await soon.balanceOf(addr1.address)).to.equal(expectedReceived);
      expect(await soon.balanceOf(await soon.burnAddress())).to.equal(burnAmount);
      expect(await soon.balanceOf(liquidityManager.address)).to.equal(liquidityAmount);
      
      // Check total supply reduced by burn amount
      expect(await soon.totalSupply()).to.equal(TOTAL_SUPPLY.sub(burnAmount));
    });
    
    it("Should not apply tax when sender is excluded from fee", async function () {
      // Exclude the owner from fee
      await soon.excludeFromFee(owner.address, true);
      
      const transferAmount = ethers.utils.parseEther("1000");
      
      // Transfer from excluded owner to addr1
      await soon.transfer(addr1.address, transferAmount);
      
      // Check full amount received
      expect(await soon.balanceOf(addr1.address)).to.equal(transferAmount);
      
      // Check no burn occurred
      expect(await soon.balanceOf(await soon.burnAddress())).to.equal(0);
      
      // Check no liquidity fee sent
      expect(await soon.balanceOf(liquidityManager.address)).to.equal(0);
    });
    
    it("Should not apply tax when recipient is excluded from fee", async function () {
      // Exclude addr1 from fee
      await soon.excludeFromFee(addr1.address, true);
      
      const transferAmount = ethers.utils.parseEther("1000");
      
      // Transfer from owner to excluded addr1
      await soon.transfer(addr1.address, transferAmount);
      
      // Check full amount received
      expect(await soon.balanceOf(addr1.address)).to.equal(transferAmount);
      
      // Check no burn occurred
      expect(await soon.balanceOf(await soon.burnAddress())).to.equal(0);
      
      // Check no liquidity fee sent
      expect(await soon.balanceOf(liquidityManager.address)).to.equal(0);
    });
  });
  
  describe("Reflection Mechanics", function() {
    it("Should exclude and include addresses from rewards", async function () {
      expect(await soon.isExcludedFromReward(owner.address)).to.be.true;
      
      // Exclude addr1 from rewards
      await soon.excludeFromReward(addr1.address, true);
      expect(await soon.isExcludedFromReward(addr1.address)).to.be.true;
      
      // Include back in rewards
      await soon.excludeFromReward(addr1.address, false);
      expect(await soon.isExcludedFromReward(addr1.address)).to.be.false;
    });
    
    it("Should distribute reflection rewards correctly", async function () {
      // Give tokens to three addresses and ensure they're not excluded from rewards
      await soon.transfer(addr1.address, ethers.utils.parseEther("1000000"));
      await soon.transfer(addr2.address, ethers.utils.parseEther("2000000"));
      await soon.excludeFromReward(addr3.address, false); // Make sure addr3 is included
      await soon.transfer(addr3.address, ethers.utils.parseEther("3000000"));
      
      // Record balances before reflection
      const addr1BalanceBefore = await soon.balanceOf(addr1.address);
      const addr2BalanceBefore = await soon.balanceOf(addr2.address);
      const addr3BalanceBefore = await soon.balanceOf(addr3.address);
      
      // Generate reflection rewards by performing a taxed transfer
      await soon.connect(addr1).transfer(addr2.address, ethers.utils.parseEther("100000"));
      
      // Verify balances increased due to reflection (except addr1 who sent funds)
      expect(await soon.balanceOf(addr3.address)).to.be.gt(addr3BalanceBefore);
      
      // Addr2 balance should be greater than simply receiving the after-tax amount 
      // (it also got reflection)
      const taxedAmount = ethers.utils.parseEther("100000").mul(690).div(10000);
      const expectedAddr2Min = addr2BalanceBefore.add(ethers.utils.parseEther("100000").sub(taxedAmount));
      expect(await soon.balanceOf(addr2.address)).to.be.gt(expectedAddr2Min);
    });
  });
  
  describe("Ownership Functions", function() {
    it("Should update tax rates correctly", async function () {
      await soon.updateTaxSettings(
        500, // 5% tax
        300, // 3% reflection
        100, // 1% burn
        100  // 1% liquidity
      );
      
      expect(await soon.taxRateBIPS()).to.equal(500);
      expect(await soon.reflectionFeeBIPS()).to.equal(300);
      expect(await soon.burnFeeBIPS()).to.equal(100);
      expect(await soon.liquidityFeeBIPS()).to.equal(100);
    });
    
    it("Should prevent non-owner from calling owner functions", async function () {
      await expect(
        soon.connect(addr1).updateTaxSettings(500, 300, 100, 100)
      ).to.be.revertedWith("Ownable: caller is not the owner");
      
      await expect(
        soon.connect(addr1).setLiquidityManager(addr1.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
      
      await expect(
        soon.connect(addr1).excludeFromFee(addr1.address, true)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
    
    it("Should allow transferring ownership", async function () {
      await soon.transferOwnership(addr1.address);
      expect(await soon.owner()).to.equal(addr1.address);
      
      // New owner should be able to call owner functions
      await soon.connect(addr1).updateTaxSettings(500, 300, 100, 100);
      expect(await soon.taxRateBIPS()).to.equal(500);
    });
  });
  
  describe("Emergency Recovery Functions", function() {
    it("Should rescue trapped ERC20 tokens", async function () {
      // Deploy another token to test rescue
      const TestToken = await ethers.getContractFactory("SOON");
      const testToken = await TestToken.deploy();
      
      // Send test tokens to SOON contract
      await testToken.transfer(soon.address, ethers.utils.parseEther("1000"));
      
      // Rescue tokens
      await soon.rescueERC20(testToken.address, owner.address, ethers.utils.parseEther("1000"));
      
      // Check if rescued correctly
      expect(await testToken.balanceOf(owner.address)).to.equal(TOTAL_SUPPLY);
    });
    
    it("Should prevent rescuing SOON token itself", async function () {
      await expect(
        soon.rescueERC20(soon.address, owner.address, ethers.utils.parseEther("1000"))
      ).to.be.revertedWith("SOON: Cannot rescue self token");
    });
  });
}); 