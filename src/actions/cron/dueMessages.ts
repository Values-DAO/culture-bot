import type { Bot } from "grammy";
import type { ICultureBotCommunity } from "../../models/community";
import type { ICultureBook, ValueAlignedPost } from "../../models/cultureBook";
import { logger } from "../../utils/logger";
import { getPhotoUrl } from "../telegram/utils";
import { getOrCreateWallet } from "../wallet/utils";
import { storeMessageOnIpfs } from "../blockchain/ipfs";
import { storeMessageOnChain } from "../blockchain/onchain";
import type { ethers } from "ethers";
import { APPROVED_MESSAGE, REJECTED_MESSAGE } from "../../constants/messages";
import type mongoose from "mongoose";
import type { IPFSResponse } from "../../types/types";

export const processDuePosts = async (
  bot: Bot,
  provider: ethers.JsonRpcProvider,
  cultureBook: ICultureBook,
  post: ValueAlignedPost,
) => {
  const cultureBotCommunity = cultureBook.cultureBotCommunity as ICultureBotCommunity;
  const voteResult = await stopPostPoll(bot, cultureBotCommunity.chatId, post.pollId!);
  const votes = voteResult.options[0].voter_count - voteResult.options[1].voter_count; // yes - no
  if (votes >= 0) {
    await processApprovedMessage(bot, provider, cultureBook, post, votes);
    await sendPostResultMessage(bot, cultureBotCommunity.chatId, post.messageTgId!, cultureBook.trustPool);
  } else {
    await processRejectedMessage(cultureBook, post, votes);
    await sendPostResultMessage(bot, cultureBotCommunity.chatId, post.messageTgId!);
  }
};

export const stopPostPoll = async (bot: Bot, chatId: string, pollId: string) => {
  try {
    const result = await bot.api.stopPoll(chatId, Number(pollId!));
    return result;
  } catch (error) {
    logger.warn(`[BOT]: Error stopping poll ID: ${pollId} in chat ID: ${chatId}: ${error}`);
    throw new Error("Error stopping poll");
  }
}

export const sendPostResultMessage = async (
  bot: Bot,
  chatId: string,
  messageTgId: string,
  trustPoolId?: mongoose.Schema.Types.ObjectId
) => {
  try {
    if (trustPoolId) {
      await bot.api.sendMessage(chatId, APPROVED_MESSAGE(trustPoolId), { reply_to_message_id: Number(messageTgId), parse_mode: "Markdown" });
    } else {
      await bot.api.sendMessage(chatId, REJECTED_MESSAGE, { reply_to_message_id: Number(messageTgId), parse_mode: "Markdown" });
    }
  } catch (error) {
    logger.warn(`[BOT]: Error sending post result message for message ID: ${messageTgId} and chat ID: ${chatId}: ${error}`);
    throw new Error("Error sending post result message");
  }
};

export const processApprovedMessage = async (
  bot: Bot,
  provider: ethers.JsonRpcProvider,
  cultureBook: ICultureBook,
  post: ValueAlignedPost,
  votes: number
) => {
  try {
    const existingMessage = getExistingMessage(cultureBook, post);

    if (existingMessage) {
      await handleExistingMessage(cultureBook, post, votes);
    } else {
      await handleNewMessage(bot, provider, cultureBook, post, votes);
    }
  } catch (error) {
    logger.warn(`[BOT]: Error processing approved post ID: ${post._id}: ${error}`);
    throw new Error("Error processing approved post");
  }
};

export const getExistingMessage = (cultureBook: ICultureBook, message: ValueAlignedPost) => {
  return cultureBook.value_aligned_posts.find(
    (m) => m?.messageTgId && m?.messageTgId === message?.messageTgId && m.onchain
  );
}

export const formCustomMessageObject = async (bot: Bot, message: ValueAlignedPost) => {
  let messageContent: any = { text: message.content }; 
  if (message.hasPhoto) {
    const photoUrl = await getPhotoUrl(bot, message.photoFileId!);
    messageContent.photo = {
      url: photoUrl,
      file_id: message.photoFileId,
    };
  }

  return messageContent;
}

export const handleNewMessage = async (
  bot: Bot,
  provider: ethers.JsonRpcProvider,
  cultureBook: ICultureBook,
  post: ValueAlignedPost,
  votes: number,
) => {
  try {
    const messageContent = await formCustomMessageObject(bot, post);
    const ipfsResponse = await storeMessageOnIpfs(messageContent);
    const transactionHash = await storeMessageOnChain(provider, ipfsResponse.IpfsHash);
    await updatePostDetails(cultureBook, post, transactionHash, ipfsResponse, votes);
    logger.info(`[BOT]: Post ID: ${post._id} has been approved and stored onchain`);
    const wallet = await getOrCreateWallet(post.posterTgId!, post.posterUsername);
    // TODO: Add rewards to wallet
  } catch (error) {
    logger.warn(`[BOT]: Error handling new post ID: ${post._id}: ${error}`);
    throw new Error("Error handling new post");
  }
};

export const updatePostDetails = async (cultureBook: ICultureBook, post: ValueAlignedPost, transactionHash: string, ipfsResponse: IPFSResponse, votes: number) => {
  try {
    post.transactionHash = transactionHash;
    post.ipfsHash = ipfsResponse.IpfsHash;
    post.photoUrl = ipfsResponse?.gateway_url;
    post.status = "approved";
    post.rewardStatus = "pending";
    post.eligibleForVoting = false;
    post.onchain = true;
    post.votes.count = votes;

    await cultureBook.save();
  } catch (error) {
    logger.warn(`[BOT]: Error updating details of post ID: ${post._id}: ${error}`);
    throw new Error("Error updating post details");
  }
}

export const handleExistingMessage = async (cultureBook: ICultureBook, post: ValueAlignedPost, votes: number) => {
  try {
    logger.info(`[BOT]: Post ID: ${post._id} already exists onchain. Skipping...`);
    post.eligibleForVoting = false;
    post.onchain = false;
    post.rewardStatus = "rejected";
    post.votes.count = votes;
    await cultureBook.save();
  } catch (error) {
    logger.warn(`[BOT]: Error handling existing post ID: ${post._id}: ${error}`);
    throw new Error("Error handling existing post");
  }
}

export const processRejectedMessage = async (cultureBook: ICultureBook, message: ValueAlignedPost, votes: number) => {
  try {
    logger.info(`[BOT]: Post ID: ${message._id} has been rejected`);
    message.status = "rejected";
    message.rewardStatus = "rejected";
    message.votes.count = votes;
    message.eligibleForVoting = false;
    await cultureBook.save();
  } catch (error) {
    logger.warn(`[BOT]: Error processing rejected post ID: ${message._id}: ${error}`);
    throw new Error("Error processing rejected post");
  }
};

export const getDuePosts = async (cultureBook: ICultureBook) => {
  try {
    const cultureBotCommunity = cultureBook.cultureBotCommunity as ICultureBotCommunity;

    const posts = getDuePostsHelper(cultureBook);
    if (!posts) return

    if (posts.length === 0) {
      logger.info(
        `[BOT]: No due posts found for culture book ID: ${cultureBook._id} in community ${cultureBotCommunity.communityName}`
      );
      return;
    }

    logger.info(`[BOT]: Found ${posts.length} due posts for culture book ID: ${cultureBook._id} in community ${cultureBotCommunity.communityName}`);

    return posts;
  } catch (error) {
    logger.warn(`[BOT]: Error getting due posts for culture book ID: ${cultureBook._id}: ${error}`);
    return false;
  }
}

export const getDuePostsHelper = (cultureBook: ICultureBook) => {
  try {
    const posts = cultureBook.value_aligned_posts
    .filter((post) => post.status === "pending") // AI extracted posts don't have status
    .filter((post) => post.votingEndsAt! < new Date()) // Non AI extracted posts have votingEndsAt
    .filter((post) => post.eligibleForVoting);
    
    return posts;
  } catch (error) {
    logger.warn(`[BOT]: Error getting due posts for culture book ID: ${cultureBook._id}: ${error}`);
    return false
  }
}