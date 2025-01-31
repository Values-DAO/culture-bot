import type { ICultureBook, ValueAlignedPost } from "../../models/cultureBook";
import { Wallet, type IWallet } from "../../models/wallet";
import { TelegramService } from "../../services/telegram";
import { logger } from "../../utils/logger";
import { distributeRewardsToUser } from "../blockchain/onchain";
import { generateMerkleTreeAndProofs } from "../blockchain/rewards";
import { getAllCultureBooksWithCultureTokens, updateUserRewardStatus } from "../database/queries";

export const distributeRewards = async (): Promise<boolean> => {
  const telegramService = new TelegramService();
  
  try {
    logger.info("[BOT]: Distributing rewards...");
    
    const cultureBooks = await getAllCultureBooksWithCultureTokens();
    
    for (const book of cultureBooks) {
      try {
        // @ts-ignore
        logger.info(`[BOT]: Distributing rewards for community ${book.cultureBotCommunity!.communityName} and culture book ID: ${book._id}`);
        
        const usersGettingRewarded = await distributeRewardsForCultureBook(book);
        await telegramService.sendMessageForRewards(book, usersGettingRewarded);
        
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
): Promise<{ posterTgId: string; posterUsername: string }[] | null> => {
  const pendingPosts = getPendingPosts(book);
  const pendingUsers = getPendingUsers(pendingPosts);
  if (pendingUsers.length === 0) {
    logger.info("[BOT]: No users to distribute rewards to");
    return null;
  }
  const {wallets: usersWallets, totalFrequency} = await getUsersWallets(pendingUsers);
  // const usersWallets = [
  //   {
  //     wallet: {
  //       telegramUsername: "test",
  //       telegramId: "1110562767",
  //       publicKey: "0xEE67f1EF03741a0032A5c9Ccb74997CE910F4358",
  //     },
  //     frequency: 1,
  //   },
  //   {
  //     wallet: {
  //       telegramUsername: "test2",
  //       telegramId: "1110562767",
  //       publicKey: "0x4705c13260a1A4a3701dBC6D7D3CE68448c4BbD5",
  //     },
  //     frequency: 1,
  //   },
  // ];
  // const totalFrequency = 2;
  if (usersWallets.length === 0) {
    logger.info("[BOT]: No users to distribute rewards to");
    return null;
  }
  const baseAmount = BigInt(247252747); // 0.24725274730 % of 100B tokens
  const scaledAmount = baseAmount * BigInt(10 ** 18); // Scale by 18 decimals
  const amountUnit = scaledAmount / BigInt(totalFrequency);
  logger.info(`[BOT]: Distributing ${amountUnit} tokens to ${usersWallets.length} users each`);
  const { root, proofs } = await generateMerkleTreeAndProofs(usersWallets, amountUnit);

  // TODO:  call contract to make sure there are enough tokens to reward

  for (let i = 0; i < usersWallets.length; i++) {
    await distributeRewardsToUser(
      (BigInt(usersWallets[i].frequency) * amountUnit).toString(),
      root,
      proofs[i]["proof"],
      usersWallets[i].wallet.publicKey, // @ts-ignore
      book.cultureToken!.bondingCurveAddress
    );
    await updateUserRewardStatus(usersWallets[i].wallet.telegramId, pendingPosts, book);
  }

  return pendingUsers;
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