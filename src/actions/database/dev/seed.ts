import path from "path";
import { Types } from "mongoose";
import { connectDB, disconnectDB } from "../../../services/database";
import { CultureBotMessage } from "../../../models/message";
import { logger } from "../../../utils/logger";
import { CultureBotCommunity } from "../../../models/community";

// Define the interface for your message data
interface MessageData {
  text: string;
  senderUsername: string;
  senderTgId: string;
  messageTgId: string;
  timestamp: string;
}

async function seedDB() {
  try {
    await connectDB();

    const community = await CultureBotCommunity.findOne({ communityName: "DEVTEST: BHEL RAGDO" });

    if (!community) {
      logger.error("Community not found");
      return;
    }

    // Properly import JSON using path.resolve
    const messagesData: MessageData[] = require(path.resolve(__dirname, "../../../../converted_messages.json"));

    // First, insert the messages and get their IDs
    const insertedMessages = await CultureBotMessage.insertMany(
      messagesData.map((msg) => ({
        ...msg,
        community: community._id,
      }))
    );

    // Get the IDs of inserted messages
    const messageIds = insertedMessages.map((msg) => msg._id);

    // Update the community with the new message IDs
    await CultureBotCommunity.findByIdAndUpdate(community._id, {
      $push: { messages: { $each: messageIds } },
    });

    logger.info(`Database seeded successfully with ${messageIds.length} messages`);
  } catch (error) {
    logger.error("Error seeding database:", error);
  } finally {
    await disconnectDB();
  }
}

seedDB();
