import type { Context } from "grammy";
import { logger } from "../../utils/logger";
import { TrustPools, type ITrustPool } from "../../models/trustpool";
import { CultureBotCommunity, type ICultureBotCommunity } from "../../models/community";
import type { createCultureBotCommunityProps } from "../../types/types";
import { CultureBook, type ICultureBook, type ValueAlignedPost } from "../../models/cultureBook";
import { CultureBotMessage } from "../../models/message";
import mongoose from "mongoose";
import { CultureToken } from "../../models/cultureToken";

export const findTrustPool = async (ctx: Context): Promise<ITrustPool | null> => {
  const args = ctx.message?.text?.split(" ").slice(1);
  if (!args || args.length < 1) {
    await ctx.reply("❌ Please use format: \`/trustpool <link>\`", { parse_mode: "Markdown" });
    return null;
  }

  const [trustPoolLink] = args;
  const trustPoolId = trustPoolLink.split("/")[4]; // ! Change this if the main link changes

  await ctx.reply(`🔗 Connecting to Trust Pool...`);
  
  let trustPool = null;
  try {
    trustPool = await TrustPools.findById(trustPoolId);
  } catch (error) {
    logger.info(`[BOT]: Trust pool not found for ID: ${trustPoolId}`);
    await ctx.reply("❌ Trust pool not found.");
    return null;
  }
  
  if (!trustPool) {
    logger.info(`[BOT]: Trust pool not found for ID: ${trustPoolId}`);
    await ctx.reply("❌ Trust pool not found.");
    return null;
  }

  if (trustPool.cultureBotCommunity) {
    logger.info(`[BOT]: Trust Pool ID: ${trustPoolId} is already connected to another community.`);
    await ctx.reply("❌ This trust pool is already connected to another community.");
    return null;
  }
  
  return trustPool;
}

export const getTrustPoolById = async (trustPoolId: mongoose.Schema.Types.ObjectId): Promise<ITrustPool | null> => {
  try {
    const trustPool = await TrustPools.findById(trustPoolId).populate("cultureBotCommunity").populate({
      path: "cultureBook",
      select: "value_aligned_posts",
    });
    return trustPool;
  } catch (error) {
    logger.warn(`[BOT]: Error finding trust pool for ID: ${trustPoolId}`);
    return null;
  }
}

export const createCultureBotCommunity = async ({trustPool, username, userId, chatId, communityName}: createCultureBotCommunityProps): Promise<ICultureBotCommunity> => {
  const cultureBotCommunity = CultureBotCommunity.create({
    trustPool: trustPool._id,
    trustPoolName: trustPool.name,
    communityName,
    initiator: username,
    initiatorTgId: userId!.toString(),
    chatId: chatId!.toString(),
  });

  return cultureBotCommunity;
}

export const findCultureBookByTrustPoolId = async (trustPoolId: string): Promise<ICultureBook | null> => {
  try {
    const cultureBook = await CultureBook.findOne({ trustPool: trustPoolId });
    return cultureBook;
  } catch (error) {
    logger.error(`[BOT]: Error finding culture book for trust pool ID: ${trustPoolId}`);
    return null;
  }
}

export const findCultureBotCommunityByChatId = async (chatId: string): Promise<ICultureBotCommunity | null> => {
  try {
    const cultureBotCommunity = await CultureBotCommunity.findOne({ chatId });
    if (!cultureBotCommunity.isWatching) {
      return null;
    }
    return cultureBotCommunity;
  } catch (error) {
    logger.error(`[BOT]: Error finding culture bot community for chat ID: ${chatId}`);
    return null;
  }
}

// export const findCultureBookByCommunityId = async (communityId: string): Promise<ICultureBook | null> => {
//   try {
//     const cultureBook = await CultureBook.findOne({ cultureBotCommunity: communityId });
//     if (!cultureBook) {
//       return null;
//     }  
//     return cultureBook;
//   } catch (error) {
//     logger.error(`[BOT]: Error finding culture book for community ID: ${communityId}`);
//     return null;
//   }
// }

export const storeMessageInDB = async (message: any, community: ICultureBotCommunity, messageContent?: any): Promise<any> => {
  const text = message.text || message.caption || "";
  const botName = process.env.ENV === "prod" ? "@culturepadbot" : "@culturepadtestbot";

  const storedMessage = await CultureBotMessage.create({
    text: text.replace(new RegExp(botName, "g"), "").trim(),
    senderUsername: message.from?.username,
    senderTgId: message.from?.id.toString(),
    messageTgId: message.message_id,
    community: community._id,
    hasPhoto: !!(
      messageContent?.photo?.file_id ||
      message?.document?.file_id ||
      (message.photo ? message?.photo[message?.photo.length - 1]?.file_id : false)
    ),
    photoFileId:
      messageContent?.photo?.file_id ||
      message?.document?.file_id ||
      (message.photo ? message?.photo[message?.photo.length - 1]?.file_id : undefined),
  });

  community.messages.push(storedMessage._id);
  await community.save();

  logger.info(`[BOT]: Stored message ${storedMessage._id} in database for community: ${community.communityName} from user: ${storedMessage.senderUsername}`);

  return storedMessage;
}

export const storeToCultureBook = async (message: any, community: ICultureBotCommunity): Promise<ICultureBook | null> => {
  const content = message.text;
  const id = new mongoose.Types.ObjectId()
  const botName = process.env.ENV === "prod" ? "@culturepadbot" : "@culturepadtestbot";

  const updatedCultureBook = await CultureBook.findOneAndUpdate(
    { trustPool: community.trustPool },
    {
      $push: {
        value_aligned_posts: {
          _id: id,
          posterUsername: message.senderUsername,
          posterTgId: message.senderTgId,
          messageTgId: message.messageTgId,
          content: content.replace(new RegExp(botName, "g"), "").trim(),
          timestamp: message.timestamp,
          title: "From Telegram Community",
          source: "Telegram",
          onchain: false,
          eligibleForVoting: true,
          hasPhoto: message.hasPhoto,
          photoFileId: message.photoFileId,
          status: "pending",
          rewardStatus: "processing",
          votingEndsAt: message.votingEndsAt,
          tgPollId: message.tgPollId,
          tgPollMessageId: message.tgPollMessageId,
        },
      },
    },
    { new: true }
  );
  
  logger.info(`[BOT]: Added post ${id} to culture book ${updatedCultureBook._id} for community: ${community.communityName}`);
  
  return updatedCultureBook;
}

export const getAllCultureBotCommunities = async (): Promise<ICultureBotCommunity[]> => {
  try {
    const communities = await CultureBotCommunity.find({})
    return communities;
  } catch (error) {
    logger.error(`[BOT]: Error fetching culture bot communities: ${error}`);
    throw new Error("Error fetching culture bot communities");
  }
}

export const getAllCultureBooksWithCultureBotCommunity = async (): Promise<ICultureBook[]> => {
  try {
    const cultureBooks = await CultureBook.find({}).populate("cultureBotCommunity")
    const cultureBooksWithCommunity = cultureBooks.filter((book) => book.cultureBotCommunity);
    return cultureBooksWithCommunity.slice(-1);
  } catch (error) {
    logger.error(`[BOT]: Error fetching culture books with communities: ${error}`);
    throw new Error("Error fetching culture books with communities");
  }
};

export const getAllCultureBooksWithCultureTokens = async (): Promise<ICultureBook[]> => {
  try {
    await CultureToken.find({}); // This is a workaround to fix the issue with the culture token not being found
    const cultureBooks = await CultureBook.find().populate("cultureToken").populate({
      path: "cultureBotCommunity",
      select: "communityName chatId",
    });
    
    const cultureBooksWithTokens = cultureBooks.filter((book) => book.cultureToken);
    return cultureBooksWithTokens.slice(-1);
  } catch (error) {
    logger.error(`[BOT]: Error fetching culture books with culture tokens: ${error}`);
    throw new Error("Error fetching culture books with culture tokens");
  }
}

export const updateUserRewardStatus = async (telegramId: string, pendingPosts: ValueAlignedPost[], book: ICultureBook): Promise<void> => {
  try {
    for (const post of pendingPosts) {
      if (post.posterTgId === telegramId) {
        post.rewardStatus = "rewarded";
        logger.info(`[BOT]: Updated reward status from "pending" to "rewarded" for user ${telegramId} for post ${post._id}`);
      }
    }
    
    await book.save();
    
    return
  } catch (error) {
    logger.warn(`[BOT]: Error updating user reward status for Telegram ID: ${telegramId}: ${error}`);
    throw new Error(`Error updating user reward status for Telegram ID: ${telegramId}`);
  }
}

// export const getChatIdFromCommunity = async (bookId: string): Promise<string> => {
//   try {
//     const book = await CultureBook.findById(bookId).populate({
//       path: "cultureBotCommunity",
//       select: "chatId", 
//     });
    
//     console.log(book)
    
//     return book.cultureBotCommunity.chatId;
//   } catch (error) {
//     logger.warn(`[BOT]: Error getting chat ID from community for culture book ID: ${bookId}: ${error}`);
//     throw new Error(`Error getting chat ID from community for culture book ID: ${bookId}`);
//   }
// }