import { ethers } from "ethers";
import { config } from "../../config/config";
import { logger } from "../../utils/logger";
import { bondingCurveABI } from "../../contracts/bondingCurveABI";

export const storeMessageOnChain = async (provider: any, ipfsHash: string): Promise<string> => {
  try {
    logger.info("[BOT]: Storing post onchain...");
    const wallet = new ethers.Wallet(config.privateKey, provider);
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const messageData = abiCoder.encode(["string"], [ipfsHash]);
    const tx = await wallet.sendTransaction({
      to: wallet.address,
      data: messageData,
      value: 0,
      gasLimit: 150000,
    });
    const receipt = await tx.wait();
    if (!receipt?.hash) throw new Error(`Transaction failed: ${receipt}`);
    logger.info(`[BOT]: Transaction hash: ${receipt.hash}`);
    return receipt.hash;
  } catch (error) {
    logger.error(`[BOT]: Error storing message onchain: ${error}`);
    throw new Error("Failed to store message onchain");
  }
}

export const distributeRewardsToUser = async (amount: string, root: string, proof: any, toAddress: string, bondingCurveAddress: string) => {
  try { 
    const provider = new ethers.JsonRpcProvider(config.baseSepoliaRpc);
    const wallet = new ethers.Wallet(process.env.NEXT_PUBLIC_ADMIN_AUTHORITY_PRIVATE_KEY!, provider);
    const contract = new ethers.Contract(bondingCurveAddress, bondingCurveABI, wallet);
    const tx = await contract.distributeRewards(BigInt(amount), toAddress, proof, root, {
      gasLimit: 300000,
    });
    const receipt = await tx.wait();
    // await contract.on("RewardDistributed", (claimant, amount) => {
    //   console.log(`Reward distributed to ${claimant} of amount ${amount}`);
    // });
    logger.info(`[BOT]: Distributed ${amount} tokens to ${toAddress}. Transaction Hash: ${receipt.hash}`);
  } catch (error) {
    logger.warn(`[BOT]: Error updating merkle root for ${bondingCurveAddress}: ${error}`);
    throw new Error(`Failed to update merkle root for ${bondingCurveAddress}`);
  }
}