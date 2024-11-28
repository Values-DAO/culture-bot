import { config } from "../config/config";
import mongoose from 'mongoose';
import { logger } from "../utils/logger";

export async function connectDB() {
  try {
    await mongoose.connect(config.mongoUri)
    logger.info("Connected to MongoDB");
  } catch (error) {
    logger.error("MongoDB connection error:", error);
  }
}

export async function disconnectDB() {
  try {
    await mongoose.disconnect();
    logger.info("Disconnected from MongoDB");
  } catch (error) {
    logger.error("Error disconnecting from MongoDB:", error);
  }
}