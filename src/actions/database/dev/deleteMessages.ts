import mongoose from "mongoose";
import { TrustPools } from "../../../models/trustpool";
import { logger } from "../../../utils/logger";
import { connectDB } from "../../../services/database";
import { CultureBotCommunity } from "../../../models/community";
import { CultureBotMessage } from "../../../models/message";

async function deleteMessages(trustpoolId: string) {
  try {
    mongoose.set("bufferTimeoutMS", 300000); // Disable buffering
    
    await connectDB()
    await TrustPools.find({})
    await CultureBotCommunity.find({})
    await CultureBotMessage.find({})
    
    // Fetch only necessary fields
    const trustpool = await TrustPools.findById(trustpoolId).select("name cultureBotCommunity cultureBook").populate({
      path: "cultureBotCommunity",
      select: "messages communityName",
    });

    if (!trustpool || !trustpool.cultureBotCommunity) {
      logger.error(`[DEV]: Trust pool or Community not found for ID: ${trustpoolId}`);
      return;
    }

    const community = trustpool.cultureBotCommunity;
    const messageIds = community.messages || [];

    logger.info(`[DEV]: Trust Pool: ${trustpool.name}, Community: ${community.communityName}`);
    logger.info(`[DEV]: Found ${messageIds.length} messages for deletion.`);

    if (messageIds.length > 0) {
      // Directly delete messages instead of fetching them
      await CultureBotMessage.deleteMany({ _id: { $in: messageIds } });
      await CultureBotCommunity.updateOne({ _id: community._id }, { $set: { messages: [] } });
      logger.info(`[DEV]: Successfully deleted ${messageIds.length} messages.`);
    } else {
      logger.info(`[DEV]: No messages found to delete.`);
    }
  } catch (error) {
    logger.error(`[DEV]: Error deleting messages: ${error}`);
  }
}


deleteMessages("6776bdcdf0bbf0021856e473");