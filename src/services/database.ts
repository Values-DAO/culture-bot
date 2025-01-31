import { config } from "../config/config";
import mongoose from 'mongoose';
import { logger } from "../utils/logger";
import { CultureBook } from "../models/cultureBook";
import { CultureBotCommunity } from "../models/community";
import { TrustPools } from "../models/trustpool";
import { Wallet } from "../models/wallet";
import { CultureBotMessage } from "../models/message";
import { CultureToken } from "../models/cultureToken";

export async function connectDB() {
  try {
    await mongoose.connect(config.mongoUri)
    logger.info("[SYSTEM]: Connected to MongoDB");
  } catch (error) {
    logger.error("[SYSTEM]: MongoDB connection error:", error);
  }
}

export async function disconnectDB() {
  try {
    await mongoose.disconnect();
    logger.info("[SYSTEM]: Disconnected from MongoDB");
  } catch (error) {
    logger.error("[SYSTEM]: Error disconnecting from MongoDB:", error);
  }
}