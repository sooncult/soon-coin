const { expect } = require("chai");
const { ethers } = require("hardhat");
const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');

// Helper to create a Merkle tree and get proofs
function createMerkleTree(claims) {
  // Create leaves from address and amount pairs
  const leaves = claims.map(claim => 
    ethers.utils.solidityKeccak256(
      ['address', 'uint256'],
      [claim.address, ethers.utils.parseEther(claim.amount)]
    )
  );
  
  // Create Merkle tree
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

describe("SOONAirdrop", function () {
  let soon, airdrop;
  let owner, addr1, addr2, addr3, addr4;
  let merkleTree;
  const AIRDROP_ALLOCATION = ethers.utils.parseEther("6594900000"); // 95% of supply
  const CLAIM_PERIOD_DAYS = 30;
  
  beforeEach(async function () {
    [owner, addr1, addr2, addr3, addr4] = await ethers.getSigners();
    
    // Set up mock claim data
    const claims = [
      { address: addr1.address, amount: "1000000" },  // 1M tokens
      { address: addr2.address, amount: "2000000" },  // 2M tokens
      { address: addr3.address, amount: "3000000" }   // 3M tokens
    ];
    
    // Create Merkle tree
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
      CLAIM_PERIOD_DAYS
    );
    await airdrop.deployed();
    
    // Fund airdrop contract with 95% of tokens
    await soon.transfer(airdrop.address, AIRDROP_ALLOCATION);
  });

  describe("Deployment", function() {
    it("Should set the correct Merkle root", async function () {
      expect(await airdrop.merkleRoot()).to.equal(merkleTree.root);
    });
    
    it("Should set the correct SOON token", async function () {
      expect(await airdrop.soonToken()).to.equal(soon.address);
    });
    
    it("Should set the correct claim deadline", async function () {
      const deploymentTime = (await ethers.provider.getBlock('latest')).timestamp;
      const expectedDeadline = deploymentTime + (CLAIM_PERIOD_DAYS * 24 * 60 * 60);
      expect(await airdrop.claimDeadline()).to.equal(expectedDeadline);
    });
    
    it("Should have the correct token balance", async function () {
      expect(await soon.balanceOf(airdrop.address)).to.equal(AIRDROP_ALLOCATION);
    });
  });
  
  describe("Claiming Tokens", function() {
    it("Should allow eligible address to claim tokens", async function () {
      const claimAmount = "1000000";
      const proof = merkleTree.getProof(addr1.address, claimAmount);
      
      await airdrop.connect(addr1).claim(
        ethers.utils.parseEther(claimAmount),
        proof
      );
      
      // Check token balance after claim
      expect(await soon.balanceOf(addr1.address)).to.equal(
        ethers.utils.parseEther(claimAmount)
      );
      
      // Check claim status
      expect(await airdrop.claimed(addr1.address)).to.be.true;
      
      // Check total claimed amount
      expect(await airdrop.totalClaimedAmount()).to.equal(
        ethers.utils.parseEther(claimAmount)
      );
    });
    
    it("Should allow multiple eligible addresses to claim tokens", async function () {
      // Addr1 claims
      await airdrop.connect(addr1).claim(
        ethers.utils.parseEther("1000000"),
        merkleTree.getProof(addr1.address, "1000000")
      );
      
      // Addr2 claims
      await airdrop.connect(addr2).claim(
        ethers.utils.parseEther("2000000"),
        merkleTree.getProof(addr2.address, "2000000")
      );
      
      // Check token balances after claims
      expect(await soon.balanceOf(addr1.address)).to.equal(
        ethers.utils.parseEther("1000000")
      );
      
      expect(await soon.balanceOf(addr2.address)).to.equal(
        ethers.utils.parseEther("2000000")
      );
      
      // Check total claimed amount
      expect(await airdrop.totalClaimedAmount()).to.equal(
        ethers.utils.parseEther("3000000")
      );
    });
    
    it("Should prevent claiming with invalid Merkle proof", async function () {
      // Use addr2's proof for addr1
      const invalidProof = merkleTree.getProof(addr2.address, "2000000");
      
      await expect(
        airdrop.connect(addr1).claim(ethers.utils.parseEther("1000000"), invalidProof)
      ).to.be.revertedWith("Airdrop: Invalid Merkle proof");
    });
    
    it("Should prevent claiming with incorrect amount", async function () {
      // Create proof for the correct address but wrong amount
      const proof = merkleTree.getProof(addr1.address, "1000000");
      
      await expect(
        airdrop.connect(addr1).claim(ethers.utils.parseEther("1500000"), proof)
      ).to.be.revertedWith("Airdrop: Invalid Merkle proof");
    });
    
    it("Should prevent claiming twice", async function () {
      const proof = merkleTree.getProof(addr1.address, "1000000");
      
      // First claim succeeds
      await airdrop.connect(addr1).claim(
        ethers.utils.parseEther("1000000"),
        proof
      );
      
      // Second claim should fail
      await expect(
        airdrop.connect(addr1).claim(ethers.utils.parseEther("1000000"), proof)
      ).to.be.revertedWith("Airdrop: Tokens already claimed");
    });
    
    it("Should prevent claiming after deadline", async function () {
      // Fast-forward time past deadline
      await ethers.provider.send("evm_increaseTime", [CLAIM_PERIOD_DAYS * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine");
      
      const proof = merkleTree.getProof(addr1.address, "1000000");
      
      await expect(
        airdrop.connect(addr1).claim(ethers.utils.parseEther("1000000"), proof)
      ).to.be.revertedWith("Airdrop: Claim period has ended");
    });
    
    it("Should prevent claiming if contract has insufficient tokens", async function () {
      // Ensure airdrop contract has less tokens than needed
      await airdrop.connect(owner).recoverUnclaimedTokens(owner.address);
      
      const proof = merkleTree.getProof(addr1.address, "1000000");
      
      await expect(
        airdrop.connect(addr1).claim(ethers.utils.parseEther("1000000"), proof)
      ).to.be.revertedWith("Airdrop: Insufficient tokens in contract for this claim");
    });
  });
  
  describe("Owner Functions", function() {
    it("Should allow owner to update Merkle root before claims start", async function () {
      const newClaims = [
        { address: addr1.address, amount: "1500000" }, // Changed amount
        { address: addr4.address, amount: "4000000" }  // Added new address
      ];
      
      const newMerkleTree = createMerkleTree(newClaims);
      
      await airdrop.updateMerkleRoot(newMerkleTree.root);
      expect(await airdrop.merkleRoot()).to.equal(newMerkleTree.root);
      
      // Should be able to claim with new proof
      await airdrop.connect(addr1).claim(
        ethers.utils.parseEther("1500000"),
        newMerkleTree.getProof(addr1.address, "1500000")
      );
      
      expect(await soon.balanceOf(addr1.address)).to.equal(
        ethers.utils.parseEther("1500000")
      );
    });
    
    it("Should allow owner to extend claim deadline", async function () {
      const initialDeadline = await airdrop.claimDeadline();
      const newDeadline = initialDeadline.add(15 * 24 * 60 * 60); // +15 days
      
      await airdrop.extendClaimDeadline(newDeadline);
      expect(await airdrop.claimDeadline()).to.equal(newDeadline);
    });
    
    it("Should prevent extending deadline to an earlier time", async function () {
      const initialDeadline = await airdrop.claimDeadline();
      const earlierDeadline = initialDeadline.sub(1 * 24 * 60 * 60); // -1 day
      
      await expect(
        airdrop.extendClaimDeadline(earlierDeadline)
      ).to.be.revertedWith("Airdrop: New deadline must be in the future");
    });
    
    it("Should allow owner to recover unclaimed tokens after deadline", async function () {
      // Fast-forward time past deadline
      await ethers.provider.send("evm_increaseTime", [CLAIM_PERIOD_DAYS * 24 * 60 * 60 + 1]);
      await ethers.provider.send("evm_mine");
      
      // Claim some tokens first
      await airdrop.connect(addr1).claim(
        ethers.utils.parseEther("1000000"),
        merkleTree.getProof(addr1.address, "1000000")
      );
      
      const claimedAmount = ethers.utils.parseEther("1000000");
      const expectedUnclaimedAmount = AIRDROP_ALLOCATION.sub(claimedAmount);
      
      // Recover unclaimed tokens
      await airdrop.recoverUnclaimedTokens(owner.address);
      
      // Check if owner received the unclaimed tokens
      const ownerBalance = await soon.balanceOf(owner.address);
      expect(ownerBalance).to.equal(expectedUnclaimedAmount);
      
      // Check if airdrop contract has 0 balance
      expect(await soon.balanceOf(airdrop.address)).to.equal(0);
    });
    
    it("Should prevent recovering tokens before deadline", async function () {
      await expect(
        airdrop.recoverUnclaimedTokens(owner.address)
      ).to.be.revertedWith("Airdrop: Claim period not yet ended");
    });
    
    it("Should prevent non-owner from calling owner functions", async function () {
      await expect(
        airdrop.connect(addr1).updateMerkleRoot(ethers.constants.HashZero)
      ).to.be.revertedWith("Ownable: caller is not the owner");
      
      await expect(
        airdrop.connect(addr1).extendClaimDeadline(ethers.constants.MaxUint256)
      ).to.be.revertedWith("Ownable: caller is not the owner");
      
      await expect(
        airdrop.connect(addr1).recoverUnclaimedTokens(addr1.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
}); 