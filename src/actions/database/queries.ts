import type { Context } from "grammy";
import { logger } from "../../utils/logger";
import { TrustPools, type ITrustPool } from "../../models/trustpool";
import { CultureBotCommunity, type ICultureBotCommunity } from "../../models/community";
import type { createCultureBotCommunityProps } from "../../types/types";
import { CultureBook, type ICultureBook } from "../../models/cultureBook";

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

export const findCultureBook = async (trustPoolId: string): Promise<ICultureBook | null> => {
  try {
    const cultureBook = await CultureBook.findOne({ trustPool: trustPoolId });
    return cultureBook;
  } catch (error) {
    logger.error(`[BOT]: Error finding culture book for trust pool ID: ${trustPoolId}`);
    return null;
  }
}