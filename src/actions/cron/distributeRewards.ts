import type { ICultureBook, ValueAlignedPost } from "../../models/cultureBook";
import { Wallet, type IWallet } from "../../models/wallet";
import { TelegramService } from "../../services/telegram";
import { logger } from "../../utils/logger";
import { distributeEngagementRewardsToUser, distributeRewardsToUser } from "../blockchain/onchain";
import { generateMerkleTreeAndProofs } from "../blockchain/rewards";
import { getAllCultureBooksWithCultureTokens, updatePostEngagementRewardStatus, updateUserRewardStatus } from "../database/queries";

export const distributeRewards = async (): Promise<boolean> => {
  const telegramService = new TelegramService();
  
  try {
    logger.info("[BOT]: Distributing rewards...");
    
    const cultureBooks = await getAllCultureBooksWithCultureTokens();
    
    for (const book of cultureBooks) {
      try {
        // @ts-ignore
        logger.info(`[BOT]: Distributing rewards for community ${book.cultureBotCommunity!.communityName} and culture book ID: ${book._id}`);
        
        const { usersGettingRewarded, usersGettingEngagementRewards } = await distributeRewardsForCultureBook(book);
        await telegramService.sendMessageForRewards(book, usersGettingRewarded);
        await telegramService.sendMessageForEngagementRewards(book, usersGettingEngagementRewards);
        
      } catch (error) {
        logger.warn(`[BOT]: Error distributing rewards for culture book ID: ${book._id}: ${error}`);
        continue;
      }
    }
    
    return true;
  } catch (error) {
    logger.error(`[BOT]: Error distributing rewards: ${error}`);
    return false;
  }
};

export const distributeRewardsForCultureBook = async (
  book: ICultureBook
): Promise<{
  usersGettingRewarded: { posterTgId: string; posterUsername: string }[] | null;
  usersGettingEngagementRewards: { posterTgId: string; posterUsername: string }[] | null;
}> => {
  try {
    const pendingPosts = getPendingPosts(book);
    const pendingUsers = getPendingUsers(pendingPosts);

    // Distribute regular rewards
    let usersGettingRewarded = null;
    if (pendingUsers.length > 0) {
      const { wallets: usersWallets, totalFrequency } = await getUsersWallets(pendingUsers);

      if (usersWallets.length > 0) {
        const baseAmount = BigInt(247252747); // 0.24725274730 % of 100B tokens
        const scaledAmount = baseAmount * BigInt(10 ** 18); // Scale by 18 decimals
        const amountUnit = scaledAmount / BigInt(totalFrequency);
        logger.info(`[BOT]: Distributing ${baseAmount} tokens to ${usersWallets.length} users`);
        const { root, proofs } = await generateMerkleTreeAndProofs(usersWallets, amountUnit);

        for (let i = 0; i < usersWallets.length; i++) {
          await distributeRewardsToUser(
            (BigInt(usersWallets[i].frequency) * amountUnit).toString(),
            root,
            proofs[i]["proof"],
            usersWallets[i].wallet.publicKey, // @ts-ignore
            book.cultureToken!.bondingCurveAddress
          );
          await updateUserRewardStatus(usersWallets[i].wallet.telegramId, pendingPosts, book);
          logger.info(`[BOT]: Rewarded user ${usersWallets[i].wallet.telegramUsername} with ${BigInt(usersWallets[i].frequency) * amountUnit / BigInt(10 ** 18)} tokens`);
        }

        usersGettingRewarded = pendingUsers;
      }
    }

    // Distribute engagement rewards
    let usersGettingEngagementRewards = null;
    const engagementUsers = getEngagementUsers(pendingPosts);

    if (engagementUsers.length > 0) {
      const { wallets: engagementWallets, totalFrequency: engagementTotalFrequency } = await getUsersWallets(
        engagementUsers
      );

      if (engagementWallets.length > 0) {
        const baseAmount = BigInt(10989010); // 0.010989011 % of 100B tokens
        const scaledAmount = baseAmount * BigInt(10 ** 18); // Scale by 18 decimals
        const amountUnit = scaledAmount / BigInt(engagementTotalFrequency);
        logger.info(`[BOT]: Distributing ${baseAmount} engagement tokens to ${engagementWallets.length} users each`);
        const { root, proofs } = await generateMerkleTreeAndProofs(engagementWallets, amountUnit);

        for (let i = 0; i < engagementWallets.length; i++) {
          await distributeEngagementRewardsToUser(
            (BigInt(engagementWallets[i].frequency) * amountUnit).toString(),
            root,
            proofs[i]["proof"],
            engagementWallets[i].wallet.publicKey, // @ts-ignore
            book.cultureToken!.tokenAddress,
          );
          logger.info(`[BOT]: Rewarded user ${engagementWallets[i].wallet.telegramId} with ${BigInt(engagementWallets[i].frequency) * amountUnit / BigInt(10 ** 18)} engagement tokens`);
        }
        await updatePostEngagementRewardStatus(pendingPosts, book);

        usersGettingEngagementRewards = engagementUsers;
      }
    }

    return { usersGettingRewarded, usersGettingEngagementRewards };
  } catch (error) {
    logger.warn(`[BOT]: Error distributing rewards for culture book ID: ${book._id}: ${error}`);
    return { usersGettingRewarded: null, usersGettingEngagementRewards: null };
  }
};

// * Returns the users who have voted (aligned or not aligned) on pending posts
export const getEngagementUsers = (posts: ValueAlignedPost[]): { posterTgId: string; posterUsername: string }[] => {
  const users = posts.map((post) => {
    const alignedUsers = post.votes.alignedUsers.map((user) => ({
      posterTgId: user.userTgId,
      posterUsername: user.userTgUsername,
    }));
    const notAlignedUsers = post.votes.notAlignedUsers.map((user) => ({
      posterTgId: user.userTgId,
      posterUsername: user.userTgUsername,
    }));
    return [...alignedUsers, ...notAlignedUsers];
  });

  return users.flat(); // flatten the array cause it is an array of arrays
};

// * Returns the wallets of the users who have pending posts with their frequency
export const getUsersWallets = async (users: { posterTgId: string; posterUsername: string }[]): Promise<{wallets: {wallet: IWallet, frequency: number}[], totalFrequency: number}> => {
  const tgIds = users.map((user) => user.posterTgId);
  
  const wallets = [] 
  let totalFrequency = 0
  
  for (const tgId of tgIds) {
    const wallet = await Wallet.findOne({ telegramId: tgId });
    
    if (wallet) {
      // if wallet exists then check if it is already in wallets array
      const index = wallets.findIndex((w) => w.wallet.telegramId === tgId);
      if (index === -1) { // if not, add it to the wallets array
        wallets.push({wallet, frequency: 1});
        totalFrequency += 1;
      } else { // else, increment the frequency
        wallets[index].frequency++;
        totalFrequency += 1;
      }
    }
  }
  
  return {wallets, totalFrequency};
};  

// * Returns all the posts that aren't onchain and have a reward status of pending
export const getPendingPosts = (book: ICultureBook): ValueAlignedPost[] => {
  return book.value_aligned_posts.filter((post) => post.rewardStatus === "pending" && post.onchain);
};

// * Returns the telegram ID and username of the users who have pending posts
export const getPendingUsers = (posts: ValueAlignedPost[]): { posterTgId: string; posterUsername: string }[] => {
  return posts.map((post) => ({
    posterTgId: post.posterTgId!,
    posterUsername: post.posterUsername!,
  }));
};