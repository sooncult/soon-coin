// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/**
 * @title SOONAirdrop
 * @dev Contract for users to claim their $SOON token airdrop using a Merkle proof.
 */
contract SOONAirdrop is Ownable {
    bytes32 public merkleRoot;
    IERC20 public immutable soonToken;
    mapping(address => bool) public claimed;
    uint256 public totalClaimedAmount;
    uint256 public claimDeadline; // Timestamp after which claims are closed

    event Claimed(address indexed recipient, uint256 amount);
    event MerkleRootUpdated(bytes32 newRoot);
    event ClaimDeadlineSet(uint256 deadline);
    event UnclaimedTokensRecovered(address indexed recipient, uint256 amount);

    /**
     * @param _root The Merkle root of the airdrop distribution.
     * @param _soonTokenAddress The address of the $SOON token.
     * @param _claimPeriodDays The number of days the claim period will be open.
     */
    constructor(bytes32 _root, address _soonTokenAddress, uint256 _claimPeriodDays) {
        require(_soonTokenAddress != address(0), "Airdrop: SOON token address cannot be zero");
        require(_claimPeriodDays > 0, "Airdrop: Claim period must be positive");

        merkleRoot = _root;
        soonToken = IERC20(_soonTokenAddress);
        claimDeadline = block.timestamp + (_claimPeriodDays * 1 days);
        emit MerkleRootUpdated(_root);
        emit ClaimDeadlineSet(claimDeadline);
    }

    /**
     * @notice Allows a user to claim their airdropped tokens.
     * @param amount The amount of tokens the user is eligible for.
     * @param proof The Merkle proof verifying the user's eligibility.
     */
    function claim(uint256 amount, bytes32[] calldata proof) external {
        require(block.timestamp <= claimDeadline, "Airdrop: Claim period has ended");
        require(!claimed[msg.sender], "Airdrop: Tokens already claimed");
        require(amount > 0, "Airdrop: Claim amount must be positive");

        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, amount));
        require(MerkleProof.verify(proof, merkleRoot, leaf), "Airdrop: Invalid Merkle proof");

        claimed[msg.sender] = true;
        totalClaimedAmount += amount;

        uint256 contractBalance = soonToken.balanceOf(address(this));
        require(contractBalance >= amount, "Airdrop: Insufficient tokens in contract for this claim");
        
        require(soonToken.transfer(msg.sender, amount), "Airdrop: Token transfer failed");
        emit Claimed(msg.sender, amount);
    }

    /**
     * @notice Updates the Merkle root (e.g., if a correction is needed before claims start).
     * @dev Only callable by the owner. Should be used with extreme caution.
     * Best to set it once correctly in the constructor.
     */
    function updateMerkleRoot(bytes32 _newRoot) external onlyOwner {
        require(block.timestamp < claimDeadline, "Airdrop: Cannot update root after claim period starts or ends");
        // Potentially add a check that totalClaimedAmount is 0 if updates are allowed after deployment
        merkleRoot = _newRoot;
        emit MerkleRootUpdated(_newRoot);
    }

    /**
     * @notice Allows the owner to recover unclaimed SOON tokens after the claim deadline.
     * These tokens can then be burned or used for other community purposes as decided.
     * @param recipient The address to send the unclaimed tokens to (e.g., burn address or treasury).
     */
    function recoverUnclaimedTokens(address recipient) external onlyOwner {
        require(block.timestamp > claimDeadline, "Airdrop: Claim period not yet ended");
        require(recipient != address(0), "Airdrop: Recipient cannot be zero address");

        uint256 unclaimedBalance = soonToken.balanceOf(address(this));
        if (unclaimedBalance > 0) {
            require(soonToken.transfer(recipient, unclaimedBalance), "Airdrop: Recovery transfer failed");
            emit UnclaimedTokensRecovered(recipient, unclaimedBalance);
        }
    }

    /**
     * @notice Allows the owner to extend the claim deadline.
     * @param newClaimDeadline The new timestamp for the claim deadline.
     */
    function extendClaimDeadline(uint256 newClaimDeadline) external onlyOwner {
        require(newClaimDeadline > claimDeadline, "Airdrop: New deadline must be in the future");
        claimDeadline = newClaimDeadline;
        emit ClaimDeadlineSet(claimDeadline);
    }
}
