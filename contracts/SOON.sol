// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol"; // For sendValue

/**
 * @title SOON Token
 * @dev A deflationary and reflective memecoin on Rootstock.
 * Features:
 * - 6.9% tax on transfers (configurable).
 * - Tax distributed to: Reflection for holders, Burn, Liquidity Pool.
 * - RFI-style reflection mechanism.
 * - Excludable addresses from fees and rewards (e.g., LP pair, liquidity manager).
 */
contract SOON is ERC20, Ownable {
    using Address for address payable;

    // --- Constants & Variables ---

    // Total supply: 6,942,000,000
    uint256 public constant INITIAL_SUPPLY = 6_942_000_000 * 10**18;

    // Tax Configuration (in basis points, 100 bips = 1%)
    uint256 public taxRateBIPS = 690; // 6.9% total tax
    uint256 public reflectionFeeBIPS = 333; // 3.33% for reflection
    uint256 public burnFeeBIPS = 200;       // 2.00% for burn
    uint256 public liquidityFeeBIPS = 157;  // 1.57% for liquidity

    uint256 public constant MAX_TAX_RATE_BIPS = 1000; // Max 10% tax
    uint256 public constant TOTAL_BIPS = 10000;

    address public immutable burnAddress = 0x000000000000000000000000000000000000dEaD;
    address public liquidityManagerAddress;

    // RFI Reflection Variables
    mapping(address => uint256) private _rOwned;
    mapping(address => uint256) private _tOwned;
    uint256 private _tTotal; // Total supply for reflection calculations
    uint256 private _rTotal; // Total reflected supply
    uint256 private constant MAX_UINT256 = type(uint256).max;

    // Exclusions
    mapping(address => bool) private _isExcludedFromFee;
    mapping(address => bool) private _isExcludedFromReward;
    address[] private _excludedFromRewardList; // To iterate for reflection calculations

    // --- Events ---
    event LiquidityManagerSet(address indexed manager);
    event TaxRateUpdated(uint256 newTaxRateBIPS, uint256 newReflectionFeeBIPS, uint256 newBurnFeeBIPS, uint256 newLiquidityFeeBIPS);
    event ExcludedFromFee(address indexed account, bool isExcluded);
    event ExcludedFromReward(address indexed account, bool isExcluded);
    event TokensBurned(address indexed from, uint256 amount);
    event LiquidityFeeSent(address indexed to, uint256 amount);
    event MinTokensBeforeSwapUpdated(uint256 minTokens); // If auto-swap to RBTC for LP is added

    // --- Constructor ---
    constructor() ERC20("SOON", "SOON") {
        _tTotal = INITIAL_SUPPLY;
        _rTotal = (MAX_UINT256 - (MAX_UINT256 % _tTotal)); // Initialize with a value that maintains precision

        _mint(msg.sender, INITIAL_SUPPLY);

        // Deployer is initially excluded from fees and rewards
        _excludeFromFee(msg.sender, true);
        _excludeFromReward(msg.sender, true);
        // Burn address is always excluded from rewards
        _excludeFromReward(burnAddress, true);

        // Ensure tax components sum up correctly
        require(reflectionFeeBIPS + burnFeeBIPS + liquidityFeeBIPS == taxRateBIPS, "SOON: Tax components mismatch total tax rate");
    }

    // --- ERC20 Overrides & Core Logic ---

    function decimals() public view virtual override returns (uint8) {
        return 18;
    }

    function totalSupply() public view virtual override returns (uint256) {
        return _tTotal; // Reflects actual circulating supply after burns
    }

    function balanceOf(address account) public view virtual override returns (uint256) {
        if (_isExcludedFromReward[account]) {
            return _tOwned[account];
        }
        return tokenFromReflection(_rOwned[account]);
    }

    function _transfer(address from, address to, uint256 amount) internal virtual override {
        require(from != address(0), "ERC20: transfer from the zero address");
        require(to != address(0), "ERC20: transfer to the zero address");
        require(amount > 0, "Transfer amount must be greater than zero");

        if (_isExcludedFromFee[from] || _isExcludedFromFee[to] || taxRateBIPS == 0) {
            _standardTransfer(from, to, amount);
            return;
        }

        // Calculate tax
        uint256 taxAmount = (amount * taxRateBIPS) / TOTAL_BIPS;
        uint256 netAmount = amount - taxAmount;

        // Distribute tax
        uint256 reflectionShare = (taxAmount * reflectionFeeBIPS) / taxRateBIPS;
        uint256 burnShare = (taxAmount * burnFeeBIPS) / taxRateBIPS;
        uint256 liquidityShare = (taxAmount * liquidityFeeBIPS) / taxRateBIPS;

        // Perform transfers
        _tOwned[from] -= amount; // Deduct full amount from sender's tOwned

        // Update rOwned for sender
        if (!_isExcludedFromReward[from]) {
            _rOwned[from] -= amount * _getRate();
        }
        
        // 1. Handle Reflection
        _reflectFee(reflectionShare);

        // 2. Handle Burn
        if (burnShare > 0) {
            _tTotal -= burnShare; // Reduce total supply
            // No need to adjust _rOwned for burnAddress as it's excluded and doesn't receive reflections
            emit TokensBurned(from, burnShare);
            emit Transfer(from, burnAddress, burnShare);
        }

        // 3. Handle Liquidity Fee
        if (liquidityShare > 0) {
            require(liquidityManagerAddress != address(0), "SOON: Liquidity Manager not set");
            _tOwned[liquidityManagerAddress] += liquidityShare;
            if(!_isExcludedFromReward[liquidityManagerAddress]){
                 _rOwned[liquidityManagerAddress] += liquidityShare * _getRate();
            }
            emit LiquidityFeeSent(liquidityManagerAddress, liquidityShare);
            emit Transfer(from, liquidityManagerAddress, liquidityShare);
        }
        
        // 4. Transfer net amount to recipient
        _tOwned[to] += netAmount;
        if (!_isExcludedFromReward[to]) {
            _rOwned[to] += netAmount * _getRate();
        }
        emit Transfer(from, to, netAmount);
    }

    function _standardTransfer(address sender, address recipient, uint256 amount) private {
        uint256 currentRate = _getRate();
        // Deduct from sender
        _tOwned[sender] -= amount;
        if (!_isExcludedFromReward[sender]) {
            _rOwned[sender] -= amount * currentRate;
        }
        // Add to recipient
        _tOwned[recipient] += amount;
        if (!_isExcludedFromReward[recipient]) {
            _rOwned[recipient] += amount * currentRate;
        }
        emit Transfer(sender, recipient, amount);
    }

    // --- Reflection (RFI) Logic ---

    function _reflectFee(uint256 tFee) private {
        if (tFee == 0) return;
        _rTotal -= (_rTotal / _tTotal) * tFee; // Effectively increases the share of rTotal per tTotal
        // No explicit Transfer event for reflection, it's implicit in balanceOf changes
    }

    function tokenFromReflection(uint256 rAmount) private view returns (uint256) {
        require(rAmount <= _rTotal, "Amount exceeds rTotal");
        if (_rTotal == 0) return 0; // Avoid division by zero if _rTotal somehow becomes 0 (e.g. all tokens burned)
        return rAmount / _getRate();
    }

    function _getRate() private view returns (uint256) {
        if (_tTotal == 0) return _rTotal; // or some other default/error, avoid div by zero
        return _rTotal / _tTotal;
    }

    // --- Owner Functions ---

    function setLiquidityManager(address _manager) external onlyOwner {
        require(_manager != address(0), "SOON: Manager address cannot be zero");
        liquidityManagerAddress = _manager;
        // It's recommended to exclude the liquidity manager from fees and rewards
        // _excludeFromFee(_manager, true); // Owner should do this explicitly if desired
        // _excludeFromReward(_manager, true); // Owner should do this explicitly if desired
        emit LiquidityManagerSet(_manager);
    }

    function updateTaxSettings(
        uint256 newTaxRateBIPS,
        uint256 newReflectionFeeBIPS,
        uint256 newBurnFeeBIPS,
        uint256 newLiquidityFeeBIPS
    ) external onlyOwner {
        require(newTaxRateBIPS <= MAX_TAX_RATE_BIPS, "SOON: Tax rate exceeds maximum");
        require(newReflectionFeeBIPS + newBurnFeeBIPS + newLiquidityFeeBIPS == newTaxRateBIPS, "SOON: Tax components mismatch total tax rate");

        taxRateBIPS = newTaxRateBIPS;
        reflectionFeeBIPS = newReflectionFeeBIPS;
        burnFeeBIPS = newBurnFeeBIPS;
        liquidityFeeBIPS = newLiquidityFeeBIPS;
        emit TaxRateUpdated(newTaxRateBIPS, newReflectionFeeBIPS, newBurnFeeBIPS, newLiquidityFeeBIPS);
    }

    function excludeFromFee(address account, bool excluded) external onlyOwner {
       _excludeFromFee(account, excluded);
    }

    function _excludeFromFee(address account, bool excluded) private {
        require(_isExcludedFromFee[account] != excluded, "SOON: Account already in specified fee status");
        _isExcludedFromFee[account] = excluded;
        emit ExcludedFromFee(account, excluded);
    }
    
    function excludeFromReward(address account, bool excluded) external onlyOwner {
        _excludeFromReward(account, excluded);
    }

    function _excludeFromReward(address account, bool excluded) private {
        require(account != address(0), "SOON: Zero address cannot be excluded from reward");
        require(_isExcludedFromReward[account] != excluded, "SOON: Account already in specified reward status");
        
        uint256 currentRate = _getRate();
        if (excluded) {
            // If becoming excluded: store current tOwned, clear rOwned
            _tOwned[account] = balanceOf(account); // Get actual balance before changing status
            _rOwned[account] = 0;
            _excludedFromRewardList.push(account);
        } else {
            // If becoming included: calculate rOwned from tOwned, clear tOwned
            _rOwned[account] = _tOwned[account] * currentRate;
            _tOwned[account] = 0;
            // Remove from _excludedFromRewardList
            for (uint i = 0; i < _excludedFromRewardList.length; i++) {
                if (_excludedFromRewardList[i] == account) {
                    _excludedFromRewardList[i] = _excludedFromRewardList[_excludedFromRewardList.length - 1];
                    _excludedFromRewardList.pop();
                    break;
                }
            }
        }
        _isExcludedFromReward[account] = excluded;
        emit ExcludedFromReward(account, excluded);
    }

    /**
     * @dev Rescue function to retrieve any RBTC accidentally sent to this contract.
     */
    function rescueRBTC(address payable to) external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "SOON: No RBTC to rescue");
        to.sendValue(balance);
    }

    /**
     * @dev Rescue function to retrieve any ERC20 tokens accidentally sent to this contract.
     * @param tokenAddress The address of the ERC20 token to rescue.
     * @param to The address to send the rescued tokens to.
     */
    function rescueERC20(address tokenAddress, address to, uint256 amount) external onlyOwner {
        require(tokenAddress != address(this), "SOON: Cannot rescue self token");
        IERC20 token = IERC20(tokenAddress);
        uint256 balance = token.balanceOf(address(this));
        require(amount <= balance, "SOON: Insufficient token balance to rescue");
        require(token.transfer(to, amount), "SOON: Token transfer failed");
    }

    // --- Receive Ether ---
    // Make contract payable to receive RBTC for liquidity provision if needed directly
    // or for rescue.
    receive() external payable {}
}


