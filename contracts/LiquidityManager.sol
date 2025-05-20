// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// --- Interfaces for SushiSwap V3 ---
// These are simplified. For a real deployment, use official SushiSwap/Uniswap interfaces.

interface INonfungiblePositionManager {
    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }

    struct IncreaseLiquidityParams {
        uint256 tokenId;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }

    struct DecreaseLiquidityParams {
        uint256 tokenId;
        uint128 liquidity;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }

    struct CollectParams {
        uint256 tokenId;
        address recipient;
        uint128 amount0Max;
        uint128 amount1Max;
    }

    function mint(MintParams calldata params)
        external
        payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);

    function increaseLiquidity(IncreaseLiquidityParams calldata params)
        external
        payable
        returns (uint128 liquidity, uint256 amount0, uint256 amount1);

    function decreaseLiquidity(DecreaseLiquidityParams calldata params)
        external
        payable
        returns (uint256 amount0, uint256 amount1);

    function collect(CollectParams calldata params) external payable returns (uint256 amount0, uint256 amount1);

    function positions(uint256 tokenId)
        external
        view
        returns (
            uint96 nonce,
            address operator,
            address token0,
            address token1,
            uint24 fee,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        );
    
    function approve(address to, uint256 tokenId) external; // For transferring NFT ownership
}

interface IUniswapV3PoolOracle {
    // Function to get TWAP tick. Parameters might vary based on exact oracle implementation.
    // This is a conceptual interface. You'll need to find the specific interface for the
    // SushiSwap V3 TWAP oracle on Rootstock.
    // Typically, observe() returns an array of observations.
    // For simplicity, assuming a function that directly gives a TWAP tick.
    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s);
    
    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        );
}

/**
 * @title LiquidityManager
 * @dev Manages a SushiSwap V3 liquidity position for SOON/RBTC.
 * Collects fees and rebalances the position around a TWAP.
 * Designed to be permissionless after initial setup and ownership renouncement.
 * 
 * The constructor takes:
 * - SOON token address
 * - RBTC token address (WRBTC)
 * - SushiSwap V3 NonfungiblePositionManager address
 * - SushiSwap V3 Pool address for TWAP oracle (optional, empty = mock mode)
 */
contract LiquidityManager is Ownable, ReentrancyGuard, IUniswapV3PoolOracle {
    INonfungiblePositionManager public immutable positionManager;
    IUniswapV3PoolOracle public sushiPoolOracle; // Removed immutable - will be set in constructor
    
    IERC20 public immutable soonToken;
    address public immutable rbtcToken; // WNATIVE address on Rootstock (WRBTC)

    uint256 public positionTokenId;
    uint24 public constant POOL_FEE = 3000; // 0.3% fee tier for typical memecoin pairs
    int24 public tickDistance; // Determines the width of the liquidity range (+/- tickDistance from current TWAP)
    uint32 public twapIntervalSeconds; // e.g., 1800 for 30-minute TWAP

    bool public isLocked; // If true, ownership functions are disabled
    bool public isMockMode; // If true, we're using mock oracle functions

    event PositionInitialized(uint256 indexed tokenId, int24 initialTickLower, int24 initialTickUpper);
    event PositionRebalanced(uint256 indexed tokenId, int24 newTickLower, int24 newTickUpper, uint128 newLiquidity);
    event FeesCollected(uint256 amountSOON, uint256 amountRBTC);
    event TickDistanceUpdated(int24 newTickDistance);
    event TwapIntervalUpdated(uint32 newTwapInterval);
    event ManagerLocked();

    constructor(
        address _soonTokenAddress,
        address _rbtcTokenAddress,
        address _positionManagerAddress,
        address _poolOracleAddress
    ) {
        require(_positionManagerAddress != address(0) &&
                _soonTokenAddress != address(0) && _rbtcTokenAddress != address(0), "LM: Zero address provided");
        
        soonToken = IERC20(_soonTokenAddress);
        rbtcToken = _rbtcTokenAddress; // This should be WRBTC
        positionManager = INonfungiblePositionManager(_positionManagerAddress);
        
        // Set up oracle mode based on parameters
        if (_poolOracleAddress != address(0)) {
            // Production mode: Use the provided pool address as oracle
            sushiPoolOracle = IUniswapV3PoolOracle(_poolOracleAddress);
            isMockMode = false;
        } else {
            // Testing mode: Use self-referential mock oracle
            sushiPoolOracle = IUniswapV3PoolOracle(address(this));
            isMockMode = true;
        }
        
        // Default values for tick distance and TWAP interval
        tickDistance = 2000;           // Default tick distance
        twapIntervalSeconds = 1800;    // Default TWAP interval (30 mins)
    }

    /**
     * @notice Initializes the liquidity position. Called by the owner once after deploying
     * and funding this contract with SOON and RBTC (WRBTC).
     * @param amountSOONDesired The amount of SOON to provide as liquidity.
     * @param amountRBTCDdesired The amount of RBTC (WRBTC) to provide.
     * @param targetTick The desired initial center tick for the position.
     * Can be current pool tick or a strategic price.
     * @dev Approvals for SOON and RBTC to the NonfungiblePositionManager must be done prior to calling this.
     * This contract should hold the SOON and RBTC to be added.
     */
    function initializePosition(
        uint256 amountSOONDesired,
        uint256 amountRBTCDdesired,
        int24 targetTick
    ) external payable onlyOwner nonReentrant {
        require(positionTokenId == 0, "LM: Position already initialized");
        require(!isLocked, "LM: Contract is locked");
        require(amountSOONDesired > 0 && amountRBTCDdesired > 0, "LM: Amounts must be positive");

        // Ensure this contract has the tokens
        require(soonToken.balanceOf(address(this)) >= amountSOONDesired, "LM: Insufficient SOON balance");
        // For RBTC, this contract must have WRBTC. If native RBTC is sent, it needs to be wrapped.
        // Assuming WRBTC is sent directly or wrapped before this call.
        require(IERC20(rbtcToken).balanceOf(address(this)) >= amountRBTCDdesired, "LM: Insufficient RBTC (WRBTC) balance");

        // Approve tokens to the Position Manager
        soonToken.approve(address(positionManager), amountSOONDesired);
        IERC20(rbtcToken).approve(address(positionManager), amountRBTCDdesired);

        int24 tickLower = targetTick - tickDistance;
        int24 tickUpper = targetTick + tickDistance;

        // Align ticks to be multiples of tickSpacing for the pool fee tier
        // For a 0.3% fee tier, tickSpacing is typically 60.
        // This step is crucial and depends on the specific pool's tickSpacing.
        // tickLower = (tickLower / 60) * 60; // Example, replace 60 with actual tickSpacing
        // tickUpper = (tickUpper / 60) * 60; // Example
        // If not aligned, minting might revert or use nearest valid tick.

        INonfungiblePositionManager.MintParams memory params = INonfungiblePositionManager.MintParams({
            token0: address(soonToken) < rbtcToken ? address(soonToken) : rbtcToken,
            token1: address(soonToken) < rbtcToken ? rbtcToken : address(soonToken),
            fee: POOL_FEE,
            tickLower: address(soonToken) < rbtcToken ? tickLower : -tickUpper, // Tick ordering depends on token0/token1
            tickUpper: address(soonToken) < rbtcToken ? tickUpper : -tickLower,
            amount0Desired: address(soonToken) < rbtcToken ? amountSOONDesired : amountRBTCDdesired,
            amount1Desired: address(soonToken) < rbtcToken ? amountRBTCDdesired : amountSOONDesired,
            amount0Min: 0, // WARNING: Setting to 0 accepts any price. Consider calculating a safe minimum.
            amount1Min: 0, // WARNING: Setting to 0 accepts any price.
            recipient: address(this), // LP NFT minted to this contract
            deadline: block.timestamp + 600 // 10 minutes deadline
        });
        
        uint256 mintedTokenId;
        uint128 liquidity;
        // If RBTC is used, msg.value might be needed if one of the tokens is native WETH/WRBTC and mint expects it
        // However, standard V3 mint with ERC20s (including WRBTC) usually doesn't require msg.value here
        // if approvals are done and tokens are in this contract.
        // If params.token1 is WRBTC and it's being provided as native RBTC, then:
        // (mintedTokenId, liquidity, , ) = positionManager.mint{value: amountRBTCDdesired}(params);
        (mintedTokenId, liquidity, , ) = positionManager.mint(params);

        positionTokenId = mintedTokenId;
        emit PositionInitialized(positionTokenId, tickLower, tickUpper);
    }

    /**
     * @notice Public function to rebalance the liquidity position.
     * Collects fees, calculates a new range around TWAP, and moves liquidity.
     * Anyone can call this. Keepers are incentivized by maintaining LP health.
     */
    function rebalancePosition() external nonReentrant {
        require(positionTokenId != 0, "LM: Position not initialized");
        // No isLocked check here, rebalancing should always be possible.

        // 1. Collect accrued fees
        // Fees are sent to this contract.
        (uint256 feesSOON, uint256 feesRBTC) = _collectFees();
        emit FeesCollected(feesSOON, feesRBTC);

        // 2. Get current position details and TWAP
        ( , , address token0, address token1, , int24 oldTickLower, int24 oldTickUpper, uint128 currentLiquidity, , , , ) =
            positionManager.positions(positionTokenId);
        
        int24 currentTwapTick = _getTwapTick();
        if (currentTwapTick == type(int24).max) { // Error sentinel from _getTwapTick
            // Optional: Revert, or log, or skip rebalance if TWAP is unavailable
            return; 
        }

        // 3. Calculate new range around TWAP
        int24 newTickLower = currentTwapTick - tickDistance;
        int24 newTickUpper = currentTwapTick + tickDistance;

        // 4. If range has moved significantly, rebalance
        // This is a simple check. More sophisticated logic could be added.
        if (newTickLower > oldTickUpper || newTickUpper < oldTickLower) {
            // Range has moved outside current position, rebalance
            _rebalanceToNewRange(currentLiquidity, newTickLower, newTickUpper);
        }
    }

    /**
     * @notice Internal function to collect fees from the position.
     * @return amountSOON The amount of SOON fees collected.
     * @return amountRBTC The amount of RBTC fees collected.
     */
    function _collectFees() internal returns (uint256 amountSOON, uint256 amountRBTC) {
        INonfungiblePositionManager.CollectParams memory params = INonfungiblePositionManager.CollectParams({
            tokenId: positionTokenId,
            recipient: address(this),
            amount0Max: type(uint128).max,
            amount1Max: type(uint128).max
        });

        (uint256 amount0, uint256 amount1) = positionManager.collect(params);

        // Determine which token is which based on token ordering in the pool
        if (address(soonToken) < rbtcToken) {
            amountSOON = amount0;
            amountRBTC = amount1;
        } else {
            amountSOON = amount1;
            amountRBTC = amount0;
        }
    }

    /**
     * @notice Internal function to get the current TWAP tick.
     * @return The current TWAP tick, or type(int24).max if unavailable.
     */
    function _getTwapTick() internal view returns (int24) {
        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = twapIntervalSeconds;
        secondsAgos[1] = 0;

        try sushiPoolOracle.observe(secondsAgos) returns (int56[] memory tickCumulatives, uint160[] memory) {
            // Calculate TWAP tick
            int56 tickCumulativeDelta = tickCumulatives[1] - tickCumulatives[0];
            int24 twapTick = int24(tickCumulativeDelta / int56(uint56(twapIntervalSeconds)));
            return twapTick;
        } catch {
            // If observe fails, return error sentinel
            return type(int24).max;
        }
    }

    /**
     * @notice Internal function to rebalance liquidity to a new range.
     * @param currentLiquidity The current liquidity in the position.
     * @param newTickLower The new lower tick for the range.
     * @param newTickUpper The new upper tick for the range.
     */
    function _rebalanceToNewRange(
        uint128 currentLiquidity,
        int24 newTickLower,
        int24 newTickUpper
    ) internal {
        // 1. Remove liquidity from old range
        INonfungiblePositionManager.DecreaseLiquidityParams memory decreaseParams = INonfungiblePositionManager.DecreaseLiquidityParams({
            tokenId: positionTokenId,
            liquidity: currentLiquidity,
            amount0Min: 0, // WARNING: Setting to 0 accepts any price
            amount1Min: 0, // WARNING: Setting to 0 accepts any price
            deadline: block.timestamp + 600 // 10 minutes deadline
        });

        (uint256 amount0, uint256 amount1) = positionManager.decreaseLiquidity(decreaseParams);

        // 2. Collect the tokens
        INonfungiblePositionManager.CollectParams memory collectParams = INonfungiblePositionManager.CollectParams({
            tokenId: positionTokenId,
            recipient: address(this),
            amount0Max: type(uint128).max,
            amount1Max: type(uint128).max
        });

        (uint256 collected0, uint256 collected1) = positionManager.collect(collectParams);
        amount0 += collected0;
        amount1 += collected1;

        // 3. Add liquidity to new range
        INonfungiblePositionManager.IncreaseLiquidityParams memory increaseParams = INonfungiblePositionManager.IncreaseLiquidityParams({
            tokenId: positionTokenId,
            amount0Desired: amount0,
            amount1Desired: amount1,
            amount0Min: 0, // WARNING: Setting to 0 accepts any price
            amount1Min: 0, // WARNING: Setting to 0 accepts any price
            deadline: block.timestamp + 600 // 10 minutes deadline
        });

        (uint128 newLiquidity, , ) = positionManager.increaseLiquidity(increaseParams);

        emit PositionRebalanced(positionTokenId, newTickLower, newTickUpper, newLiquidity);
    }

    // --- Owner Functions ---

    /**
     * @notice Updates the tick distance for the liquidity range.
     * @param newTickDistance The new tick distance.
     */
    function updateTickDistance(int24 newTickDistance) external onlyOwner {
        require(!isLocked, "LM: Contract is locked");
        require(newTickDistance > 0 && newTickDistance < 20000, "LM: Invalid tick distance");
        tickDistance = newTickDistance;
        emit TickDistanceUpdated(newTickDistance);
    }

    /**
     * @notice Updates the TWAP interval.
     * @param newTwapInterval The new TWAP interval in seconds.
     */
    function updateTwapInterval(uint32 newTwapInterval) external onlyOwner {
        require(!isLocked, "LM: Contract is locked");
        require(newTwapInterval >= 600 && newTwapInterval <= 86400, "LM: Invalid TWAP interval");
        twapIntervalSeconds = newTwapInterval;
        emit TwapIntervalUpdated(newTwapInterval);
    }

    /**
     * @notice Locks the contract, disabling owner functions.
     * This is a one-way operation.
     */
    function lock() external onlyOwner {
        require(!isLocked, "LM: Already locked");
        isLocked = true;
        emit ManagerLocked();
    }

    /**
     * @notice Emergency function to rescue tokens sent to this contract.
     * @param token The token to rescue.
     * @param amount The amount to rescue.
     * @param to The address to send the tokens to.
     */
    function rescueTokens(address token, uint256 amount, address to) external onlyOwner {
        require(!isLocked, "LM: Contract is locked");
        require(token != address(soonToken) && token != rbtcToken, "LM: Cannot rescue SOON or RBTC");
        IERC20(token).transfer(to, amount);
    }

    /**
     * @notice Emergency function to rescue native RBTC sent to this contract.
     * @param to The address to send the RBTC to.
     */
    function rescueRBTC(address payable to) external onlyOwner {
        require(!isLocked, "LM: Contract is locked");
        uint256 balance = address(this).balance;
        require(balance > 0, "LM: No RBTC to rescue");
        to.transfer(balance);
    }

    // --- Receive Ether ---
    // Make contract payable to receive RBTC for liquidity provision if needed directly
    // or for rescue.
    receive() external payable {}

    /**
     * @notice Mock implementation of observe for the IUniswapV3PoolOracle interface
     * @dev This is only used in local testing and will revert in production mode
     */
    function observe(uint32[] calldata secondsAgos) 
        external 
        view 
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s) 
    {
        require(isMockMode, "LM: Not in mock mode");
        
        // Mock implementation that returns some dummy data
        tickCumulatives = new int56[](secondsAgos.length);
        secondsPerLiquidityCumulativeX128s = new uint160[](secondsAgos.length);
        
        // Just return 0 values for testing
        for (uint i = 0; i < secondsAgos.length; i++) {
            tickCumulatives[i] = 0;
            secondsPerLiquidityCumulativeX128s[i] = 0;
        }
        
        return (tickCumulatives, secondsPerLiquidityCumulativeX128s);
    }
    
    /**
     * @notice Mock implementation of slot0 for the IUniswapV3PoolOracle interface
     * @dev This is only used in local testing and will revert in production mode
     */
    function slot0() external view returns (
        uint160 sqrtPriceX96,
        int24 tick,
        uint16 observationIndex,
        uint16 observationCardinality,
        uint16 observationCardinalityNext,
        uint8 feeProtocol,
        bool unlocked
    ) {
        require(isMockMode, "LM: Not in mock mode");
        
        // Mock implementation that returns some dummy data
        return (
            uint160(1 << 96), // 1.0 as a Q96 number
            0,                // Current tick at 0
            0,                // Observation index
            1,                // Observation cardinality 
            1,                // Observation cardinality next
            0,                // Fee protocol
            true              // Unlocked
        );
    }
}

// Minimal ERC721 interface for NFT transfer
interface IERC721 {
    function transferFrom(address from, address to, uint256 tokenId) external;
    function approve(address to, uint256 tokenId) external;
}

 