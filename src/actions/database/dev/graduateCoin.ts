import { ethers } from "ethers";
import { bondingCurveABI } from "../../../contracts/bondingCurveABI";

const UNISWAP_CONFIG = {
  fee: 3000, // 0.3% fee tier
  tickSpacing: 60, // Corresponding tick spacing for 0.3% fee
  wethAddress: process.env.WETH_ADDRESS!,
  positionManager: process.env.UNISWAP_POSITION_MANAGER!,
  poolFactory: process.env.UNISWAP_FACTORY!,
};

// Adjusted price calculation to be more reasonable
// 1 ETH = 100,000 tokens (adjust this ratio as needed)
const tokenPrice = 0.00001; // 1/100,000 ETH per token
const tokenAddress = "0x85696865ac87d5fe2dD261B50D1de45Af21CB011";
const bondingCurveAddress = "0x3738d39a10CFE781D437FA57B95a7cB1A462ab22";

async function graduateCoin() {
  try {
    // Validate environment variables
    if (!process.env.BASE_RPC_URL) throw new Error("BASE_RPC_URL not set");
    if (!process.env.NEXT_PUBLIC_ADMIN_AUTHORITY_PRIVATE_KEY) throw new Error("NEXT_PUBLIC_ADMIN_AUTHORITY_PRIVATE_KEY not set");
    if (!UNISWAP_CONFIG.wethAddress) throw new Error("WETH_ADDRESS not set");
    if (!UNISWAP_CONFIG.positionManager) throw new Error("UNISWAP_POSITION_MANAGER not set");
    if (!UNISWAP_CONFIG.poolFactory) throw new Error("UNISWAP_FACTORY not set");

    const provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
    const wallet = new ethers.Wallet(process.env.NEXT_PUBLIC_ADMIN_AUTHORITY_PRIVATE_KEY, provider);

    // Validate addresses are properly formatted
    const validTokenAddress = ethers.getAddress(tokenAddress);
    const validBondingCurveAddress = ethers.getAddress(bondingCurveAddress);
    const validWethAddress = ethers.getAddress(UNISWAP_CONFIG.wethAddress);
    const validPositionManager = ethers.getAddress(UNISWAP_CONFIG.positionManager);
    const validPoolFactory = ethers.getAddress(UNISWAP_CONFIG.poolFactory);

    // Get contract instance
    const bondingCurve = new ethers.Contract(validBondingCurveAddress, bondingCurveABI, wallet);

    // Calculate initial tick based on current price
    // Uniswap v3 uses sqrt price in X96 format
    // Price = (1.0001)^tick
    // tick = log(price) / log(1.0001)
    const tick = Math.floor(Math.log(tokenPrice) / Math.log(1.0001));
    
    // Ensure tick is within valid range (-887272 to 887272)
    const boundedTick = Math.max(-887272, Math.min(887272, tick));
    
    // Ensure tick is divisible by tickSpacing
    const normalizedTick = Math.floor(boundedTick / UNISWAP_CONFIG.tickSpacing) * UNISWAP_CONFIG.tickSpacing;

    console.log("\nConfiguration:");
    console.log("- Token Address:", validTokenAddress);
    console.log("- Bonding Curve Address:", validBondingCurveAddress);
    console.log("- WETH Address:", validWethAddress);
    console.log("- Position Manager:", validPositionManager);
    console.log("- Pool Factory:", validPoolFactory);
    console.log("- Fee:", UNISWAP_CONFIG.fee);
    console.log("- Tick Spacing:", UNISWAP_CONFIG.tickSpacing);
    console.log("- Initial Price:", tokenPrice);
    console.log("- Calculated Tick:", tick);
    console.log("- Normalized Tick:", normalizedTick);

    // Check if caller has permission
    const callerAddress = await wallet.getAddress();
    console.log("\nCaller address:", callerAddress);

    // Estimate gas first to check if the call will succeed
    try {
      const gasEstimate = await bondingCurve.configurePool.estimateGas(
        UNISWAP_CONFIG.fee,
        normalizedTick,
        validTokenAddress,
        validWethAddress,
        UNISWAP_CONFIG.tickSpacing,
        validPositionManager,
        validPoolFactory
      );
      console.log("\nEstimated gas:", gasEstimate.toString());
    } catch (error) {
      console.error("\nGas estimation failed. This indicates the call would fail:");
      throw error;
    }

    console.log("\nCalling configurePool with parameters:");
    console.log({
      fee: UNISWAP_CONFIG.fee,
      tick: normalizedTick,
      tokenAddress: validTokenAddress,
      wethAddress: validWethAddress,
      tickSpacing: UNISWAP_CONFIG.tickSpacing,
      positionManager: validPositionManager,
      poolFactory: validPoolFactory,
    });

    // Call configurePool with higher gas limit
    const tx = await bondingCurve.configurePool(
      UNISWAP_CONFIG.fee,
      normalizedTick,
      validTokenAddress,
      validWethAddress,
      UNISWAP_CONFIG.tickSpacing,
      validPositionManager,
      validPoolFactory,
      {
        gasLimit: 1000000, // Specify a higher gas limit
      }
    );

    console.log("\nTransaction sent:", tx.hash);
    
    // Wait for transaction to be mined
    const receipt = await tx.wait();
    console.log("\nPool configured successfully:", receipt.transactionHash);
  } catch (error) {
    console.error("\nError details:", error);
    if (error instanceof Error) {
      console.error("\nError message:", error.message);
    }
    process.exit(1);
  }
}

graduateCoin();
