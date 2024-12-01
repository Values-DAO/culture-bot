import { connect } from "mongoose";
import { connectDB, disconnectDB } from "../services/database";
import { CultureBotMessage } from "../models/message";
import { logger } from "./logger";

const messages = [
  {
    text: "Hello, this is the first message!",
    senderUsername: "user1",
    transactionHash: "0x123abc456def",
  },
  {
    text: "Another important community update.",
    senderUsername: "user2",
  },
  {
    text: "Tagging this message for on-chain storage.",
    senderUsername: "user3",
    transactionHash: "0x345mno678pqr",
  },
  {
    text: "A general message without tagging.",
    senderUsername: "user4",
  },
  {
    text: "Final seed message for testing purposes.",
    senderUsername: "user5",
    transactionHash: "0x567yz123abc",
  },
];

async function seedDB () {
  try {
    await connectDB();
    await CultureBotMessage.insertMany(messages);
    logger.info("Database seeded successfully");
  } catch (error) {
    logger.error("Error seeding database:", error);
  } finally {
    disconnectDB();
  }
}

seedDB()