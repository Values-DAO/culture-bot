import { ethers } from "ethers";
import { logger } from "../../utils/logger";
import { CryptoUtils } from "../../utils/cryptoUtils";
import { Wallet } from "../../models/wallet";
import type { ValueAlignedPost } from "../../models/cultureBook";

export const getOrCreateWallet = async (posterTgId: string, posterUsername: string) => {
  try {
    // skip if wallet already exists
    const existingWallet = await Wallet.findOne({ telegramId: posterTgId });
    if (existingWallet) {
      logger.info(`[BOT]: Wallet already exists for username: ${posterUsername} and tgId: ${posterTgId}`);
      return existingWallet;
    }
   
    // create wallet
    const wallet = createWallet(posterTgId, posterUsername);
    if (!wallet) throw new Error("Error creating wallet");

    return wallet;
  } catch (error) {
    logger.error(`[BOT]: Error finding or creating wallet for username: ${posterUsername} and tgId: ${posterTgId}: ${error}`);
    throw new Error("Error finding or creating wallet");
  }
}

export const createWallet = async (posterTgId: string, posterUsername: string) => {
  const wallet = ethers.Wallet.createRandom();
  const encryptedPrivateKey = CryptoUtils.encrypt(wallet.privateKey);

  const userWallet = await Wallet.create({
    telegramId: posterTgId,
    telegramUsername: posterUsername,
    publicKey: wallet.address,
    privateKey: encryptedPrivateKey,
  });

  logger.info(`[BOT]: Wallet created for username: ${posterUsername} and tgId: ${posterTgId}`);

  return userWallet;
}

export const getOrCreateWallets = async (posts: any) => {
  try {
    const posters = getPosters(posts);
    
    const wallets = []
    for (const poster of posters) {
      const wallet = await getOrCreateWallet(poster.posterTgId, poster.posterUsername);
      wallets.push(wallet);
    }
    
    return wallets;
  } catch (error) {
    logger.error(`[BOT]: Error finding or creating wallets for AI extracted posts: ${error}`);
    throw new Error("Error finding or creating wallets for AI extracted posts");
  }
}

export const getPosters = (posts: any) => {
  const posters = posts.map((post: ValueAlignedPost) => {
    return {
      posterUsername: post.posterUsername,
      posterTgId: post.posterTgId,
    };
  });
  
  return posters;
}