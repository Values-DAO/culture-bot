import { ethers } from "ethers";
import { config } from "../../config/config";
import { logger } from "../../utils/logger";

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