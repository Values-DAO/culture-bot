import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import mongoose from "mongoose";
import axios from "axios";
import { config } from "../config";
import { connectDB, disconnectDB } from "../../src/services/database";
import { randomUUID } from "crypto";
import { logger } from "../../src/utils/logger";
import { CultureBotMessage } from "../../src/models/message";

describe("Integration Test: Telegram Bot", () => {
  let testBotToken: string;
  let testChatId: string;

  beforeAll(async () => {
    logger.info("Starting integration tests...") // without this, the test just hangs
    testBotToken = config.testTelegramBotToken; 
    testChatId = config.testChatId;
    
    await connectDB()
  });

  afterAll(async () => {
    await disconnectDB()
  });

  it("should handle a text message and store it in the database", async () => {
    const testMessage = `This is a test message for integration testing. ${randomUUID()}`;
    
    const url = `https://api.telegram.org/bot${testBotToken}/sendMessage?chat_id=${testChatId}&text=${encodeURIComponent(
      testMessage
    )}`;
    
    const response = await axios.post(url);

    // Ensure the message was sent successfully
    expect(response.data.ok).toBeTruthy();

    // Wait a few seconds for the bot to process the message
    await new Promise((resolve) => setTimeout(resolve, 200));

    const savedMessage = await CultureBotMessage.findOne({ text: testMessage });

    expect(savedMessage).not.toBeNull();
    expect(savedMessage.text).toBe(testMessage);
  });

  // it("should handle an image and return a confirmation reply", async () => {
  //   const testImage = "https://via.placeholder.com/150";

  //   // Send an image to the bot
  //   const response = await axios.post(`https://api.telegram.org/bot${testBotToken}/sendPhoto`, {
  //     chat_id: testChatId,
  //     photo: testImage,
  //     caption: "This is a test image",
  //   });

  //   // Ensure the image was sent successfully
  //   expect(response.data.ok).toBeTruthy();

  //   // Wait a few seconds for the bot to process the image
  //   await new Promise((resolve) => setTimeout(resolve, 5000));

  //   // Verify that the bot replied with the expected response
  //   const updates = await axios.get(`https://api.telegram.org/bot${testBotToken}/getUpdates`);

  //   const lastMessage = updates.data.result.pop()?.message;
  //   expect(lastMessage).not.toBeUndefined();
  //   expect(lastMessage.text).toContain("📝 Processing image...");
  // });
});
