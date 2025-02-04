import type { Bot, Context } from "grammy";
import type { ICultureBotCommunity } from "../../models/community";
import { logger } from "../../utils/logger";
import { storeMessageInDB } from "../database/queries";
import { config } from "../../config/config";

export const checkBotMention = (currentMessage: any) => {
  const botName = process.env.ENV === "prod" ? "@culturepadbot" : "@culturepadtestbot";
  
  const result = 
    currentMessage?.entities?.some(
      (entity: any) =>
        entity.type === "mention" &&
        currentMessage?.text?.slice(entity.offset, entity.offset + entity.length) === botName
    ) ||
    currentMessage?.caption_entities?.some(
      (entity: any) =>
        entity.type === "mention" &&
        currentMessage?.caption?.slice(entity.offset, entity.offset + entity.length) === botName
    );
    
  return result;
}

export const handleMessageWithoutMention = async (currentMessage: any, community: ICultureBotCommunity) => {
  if ((currentMessage?.photo || currentMessage?.document) && !currentMessage.caption) {
    // If not tagged bot a nd there is no caption, ignore photo messages
    logger.info(`[BOT]: Ignoring photo message in ${community.communityName} without caption.`);
    return;
  }
  
  await storeMessageInDB(currentMessage, community);
  return;
} 

export const createAndLaunchPoll = async (ctx: Context, messageToProcess: any) => {
  const poll = await ctx.api.sendPoll(
    ctx.chat?.id.toString()!,
    "Is this message value-aligned with our community?",
    [{ text: "Yes" }, { text: "No" }],
    {
      is_anonymous: false,
      allows_multiple_answers: false,
      reply_to_message_id: messageToProcess.message_id,
    }
  );
  
  return {tgPollMessageId: poll.message_id, tgPollId: poll.poll.id};
};

export const downloadImage = async (url: string): Promise<Buffer> => {
  logger.info(`[BOT]: Downloading image from ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to download image");
  return Buffer.from(await response.arrayBuffer());
}

export const getPhotoUrl = async (bot: Bot, photoFileId: string): Promise<string | undefined> => {
  try {
    // this URL is temporary and will expire, however, we can use the file_id to get the photo URL anytime
    const file = await bot.api.getFile(photoFileId);
    return `https://api.telegram.org/file/bot${config.telegramToken}/${file.file_path}`;
  } catch (error) {
    logger.warn(`[BOT]: Error getting photo URL for file ID: ${photoFileId}: ${error}`);
    throw new Error("Failed to get photo URL");
  }
}