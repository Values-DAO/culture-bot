import { Bot, Context } from "grammy";
import { config } from "../config/config";
import { logger } from "../utils/logger";
import { ethers } from "ethers";
import { CryptoUtils } from "../utils/cryptoUtils";
import { Wallet } from "../models/wallet";
import { isDefined } from "../actions/sanity/validateInputs";
import { COMMANDS_MESSAGE, ENGAGEMENT_REWARDED_MESSAGE, NO_REWARD_MESSAGE, POLL_MESSAGE, REWARDED_MESSAGE, WALLET_DETAILS_MESSAGE, WALLET_EXPORT_MESSAGE, WELCOME_MESSAGE } from "../constants/messages";
import mongoose, { type Schema } from "mongoose";
import {
  createCultureBotCommunity,
  findCultureBookByTrustPoolId,
  findCultureBotCommunityByChatId,
  findTrustPool,
  getAllCultureBooksWithCultureBotCommunity,
  getAllCultureBotCommunities,
  storeMessageInDB,
  storeToCultureBook,
} from "../actions/database/queries";
import { checkBotMention, createAndLaunchPoll, handleMessageWithoutMention } from "../actions/telegram/utils";
import { getETHTokensBalance } from "../actions/blockchain/tokens";
import { processCommunity } from "../actions/cron/analyzeCommunities";
import { autoRetry } from "@grammyjs/auto-retry";
import { getDuePosts, processDuePosts } from "../actions/cron/dueMessages";
import type { ICultureBotCommunity } from "../models/community";
import { CultureBook, type ICultureBook, type ValueAlignedPost } from "../models/cultureBook";
import type { ICultureToken } from "../models/cultureToken";
import { getOrCreateWallet } from "../actions/wallet/utils";

// TODO: Change trustpool functionality.

export class TelegramService {
  private bot: Bot;
  private provider: ethers.JsonRpcProvider;

  constructor() {
    this.bot = new Bot(config.telegramToken, { client: { sensitiveLogs: true } });
    this.bot.api.config.use(autoRetry());
    this.setupHandlers();
    this.provider = new ethers.JsonRpcProvider(config.baseSepoliaRpc);
  }

  private setupHandlers() {
    this.bot.on("poll_answer", (ctx: Context) => this.handlePollResults(ctx));
    this.bot.command("start", (ctx: Context) => this.handleStart(ctx));
    this.bot.command("commands", (ctx: Context) => this.handleCommands(ctx));
    this.bot.command("trustpool", (ctx: Context) => this.handleTrustPool(ctx));
    this.bot.command("wallet", (ctx: Context) => this.getWalletDetails(ctx));
    this.bot.command("exportwallet", (ctx: Context) => this.handleExportWallet(ctx));
    this.bot.on("message:photo", async (ctx: Context) => this.handleMessage(ctx));
    this.bot.on("message", (ctx: Context) => this.handleMessage(ctx));
  }

  // ! COMMAND HANDLERS

  // * START COMMAND: Replies with a welcome message
  private async handleStart(ctx: Context) {
    const username = ctx.from?.username;
    if (!isDefined(username)) {
      logger.warn("[BOT]: Received /start command with missing username.");
      return;
    }
    logger.info(`[BOT]: Received /start command from username: ${username}`);
    try {
      await ctx.reply(WELCOME_MESSAGE, { parse_mode: "Markdown" });
    } catch (error) {
      logger.error(`[BOT]: Error sending welcome message: ${error}`);
    }
  }

  // * COMMANDS COMMAND: Replies with a list of available commands
  private async handleCommands(ctx: Context) {
    const username = ctx.from?.username;
    if (!isDefined(username)) {
      logger.warn("[BOT]: Received /commands command with missing username.");
      return;
    }
    logger.info(`[BOT]: Received /commands command from username: ${username}`);
    try {
      await ctx.reply(COMMANDS_MESSAGE, { parse_mode: "Markdown" });
    } catch (error) {
      logger.error(`[BOT]: Error sending commands message: ${error}`);
    }
  }

  // * SET TRUST POOL COMMAND: Connects a community to a trust pool
  private async handleTrustPool(ctx: Context) {
    try {
      const username = ctx.from?.username;
      const userId = ctx.from?.id;
      const chatId = ctx.chat?.id;
      const communityName = ctx.chat?.title;

      if (!isDefined(username, userId, chatId, communityName)) {
        logger.warn("[BOT]: Received /trustpool command with missing parameters.");
        await ctx.reply("❌ Please provide all required parameters.");
        return;
      }

      logger.info(`[BOT]: Received /trustpool command from username: ${username} in community: ${communityName}`);

      const trustPool = await findTrustPool(ctx);
      if (!trustPool) return;

      const community = await createCultureBotCommunity({
        trustPool,
        username: username!,
        userId: userId!.toString(),
        chatId: chatId!.toString(),
        communityName: communityName!,
      });

      const cultureBook = await findCultureBookByTrustPoolId(trustPool._id);
      if (!cultureBook) throw new Error("Culture book not found for trust pool");

      cultureBook.cultureBotCommunity = community._id as Schema.Types.ObjectId;
      community.cultureBook = cultureBook._id as unknown as Schema.Types.ObjectId;
      trustPool.cultureBotCommunity = community._id as Schema.Types.ObjectId;

      await Promise.all([cultureBook.save(), community.save(), trustPool.save()]);

      logger.info(
        `[BOT]: Community name: ${communityName} connected to Trust Pool name: ${trustPool.name} and ID: ${trustPool._id}.`
      );
      await ctx.reply(`🎉 Community ${communityName} connected to Trust Pool ${trustPool.name}.`);
    } catch (error) {
      logger.error("Error handling /trustpool command:", error);
      await ctx.reply("❌ Failed to connect to trust pool. Please try again later.");
    }
  }

  // * GET WALLET DETAILS: Fetches wallet details for the user in a private chat that includes public key, ETH balance and ERC-20 token balances
  private async getWalletDetails(ctx: Context) {
    try {
      // allow this command only in private chat
      if (ctx.chat?.type !== "private") {
        await ctx.reply(
          "⚠️ For security reasons, wallet details are only available in private chat. Please message me directly."
        );
        return;
      }

      const userId = ctx.from?.id;
      if (!userId) {
        await ctx.reply("Error: Could not identify user.");
        return;
      }

      const wallet = await Wallet.findOne({ telegramId: userId });
      if (!wallet) {
        await ctx.reply("❌ No wallet found for user.");
        return;
      }

      await ctx.reply("🔍 Getting wallet details...");

      try {
        const { balanceInEth, tokensMessage } = await getETHTokensBalance(this.provider, wallet.publicKey);

        const finalTokensMessage = tokensMessage || "No ERC-20 tokens found in this wallet.";
        const message = WALLET_DETAILS_MESSAGE(wallet.publicKey, balanceInEth, finalTokensMessage);

        await ctx.reply(message, { parse_mode: "Markdown" });
        logger.info(`[BOT]: Wallet details sent for user ${wallet.telegramUsername}`);
      } catch (balanceError) {
        logger.error(`[BOT]: Error fetching wallet balances: ${balanceError}`);
        await ctx.reply("❌ Error fetching wallet balances. Please try again later.");
      }
    } catch (error) {
      logger.error(`[BOT]: Error getting wallet details: ${error}`);
      await ctx.reply("❌ Failed to get wallet details. Please try again.");
    }
  }

  // * EXPORT WALLET: Exports the wallet for the user in a private chat
  private async handleExportWallet(ctx: Context) {
    try {
      // Verify it's a private message to protect sensitive data
      if (ctx.chat?.type !== "private") {
        await ctx.reply(
          "⚠️ For security reasons, wallet export is only available in private chat. Please message me directly."
        );
        return;
      }

      const userId = ctx.from?.id;
      if (!userId) {
        await ctx.reply("Error: Could not identify user.");
        return;
      }

      const wallet = await Wallet.findOne({ telegramId: userId });
      if (!wallet) {
        await ctx.reply("❌ No wallet found for user.");
        return;
      }

      // Decrypt the private key
      const decryptedPrivateKey = CryptoUtils.decrypt(wallet.privateKey);

      const message = WALLET_EXPORT_MESSAGE(wallet.telegramUsername, wallet.publicKey, decryptedPrivateKey);

      await ctx.reply(message, { parse_mode: "Markdown" });
      logger.info(`[BOT]: Wallet exported for user ${wallet.telegramUsername}`);
    } catch (error) {
      logger.error(`[BOT]: Error exporting wallet: ${error}`);
      await ctx.reply("Failed to export wallet. Please try again.");
    }
  }

  // * HANDLE MESSAGE: Handles tagged and normal text and photo messages from the community.
  // TODO: Handle case when a photo greater than 20 mb is sent
  private async handleMessage(ctx: Context) {
    if (ctx.message?.text?.startsWith("/")) {
      // Ignore commands
      return;
    }

    try {
      const chatId = ctx.chat?.id;
      const senderUsername = ctx.from?.username || "unknown";
      const senderTgId = ctx.from?.id;

      if (!isDefined(chatId, senderUsername, senderTgId)) {
        logger.warn("[BOT]: Received message with missing parameters.");
        return;
      }

      const community = await findCultureBotCommunityByChatId(chatId!.toString());
      if (!community) {
        // TODO: Upon adding the bot to the community, this gets triggered cause the community isn't initialized yet
        logger.warn(`[BOT]: Community not found for chat ID: ${chatId} or maybe new community just got initiated!`);
        return;
      }

      const repliedMessage = ctx.message?.reply_to_message;
      const currentMessage = ctx.message;

      // Check for bot mention
      const mentionsBot = checkBotMention(currentMessage);

      // Process message without mention
      if (!mentionsBot) return await handleMessageWithoutMention(currentMessage, community);

      try {
        // Now that we have a mention, we will process the replied message if it exists
        const messageToProcess = repliedMessage || currentMessage;
        if (!messageToProcess) return;

        const processingMsg = await ctx.reply("📝 Processing message...");
        logger.info(`[BOT]: Processing message from ${senderUsername} in community ${community.communityName}`);

        // Prepare messageContent for later use
        let messageContent: any = {
          text: messageToProcess.text || messageToProcess.caption || "", // text or caption or none (for photo messages)
        };

        // Ignore messages that are just mentions without any text or photo or caption
        if (
          !messageToProcess.photo &&
          messageToProcess.text
            ?.replace(new RegExp(process.env.ENV === "prod" ? "@culturepadbot" : "@culturepadtestbot", "g"), "")
            .trim() === "" &&
          !messageToProcess.caption
        ) {
          logger.info(
            `[BOT]: Ignoring mentioned message without any text, caption or image in community ${community.communityName}`
          );
          await ctx.reply("❌ Message must contain text or a photo with a caption.");
          return;
        }

        // Check for photo (compressed and non-compressed)
        // Compressed
        if (messageToProcess.photo) {
          messageContent.photo = {
            file_id: messageToProcess.photo[messageToProcess.photo.length - 1].file_id, // last photo in the array for highest resolution
          };
        }

        // Non-compressed
        if (messageToProcess.document?.file_id) {
          messageContent.photo = {
            file_id: messageToProcess.document.file_id,
          };
        }

        // Store the message in the database
        const storedMessage = await storeMessageInDB(currentMessage, community, { ...messageContent });
        if (!storedMessage) throw new Error("Error storing message in database");

        // Launch the poll for voting
        const { tgPollId, tgPollMessageId } = await createAndLaunchPoll(ctx, messageToProcess);
        // const votingEndsAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24 hours from now
        const votingEndsAt = new Date(Date.now() + 1000 * 5); // 5 seconds from now

        let message = {
          text: messageContent.text.replace(/@culturepadbot/g, "").trim(),
          senderUsername: messageToProcess.from?.username,
          senderTgId: messageToProcess.from?.id.toString(),
          messageTgId: messageToProcess.message_id,
          community: community._id,
          hasPhoto: !!messageContent.photo,
          photoFileId: messageContent?.photo?.file_id,
          timestamp: new Date(messageToProcess.date * 1000), // Convert UNIX timestamp to JS timestamp
          votingEndsAt: votingEndsAt,
          tgPollId,
          tgPollMessageId,
        };

        logger.info(
          `[BOT]: Poll started for message sent by ${senderUsername} in community ${community.communityName}. Voting ends at ${votingEndsAt}`
        );

        // Store the message in the culture book
        const storedInCultureBook = await storeToCultureBook(message, community);
        if (!storedInCultureBook) throw new Error("Error storing message in culture book");

        await ctx.api.editMessageText(chatId!, processingMsg.message_id, POLL_MESSAGE, { parse_mode: "Markdown" });
      } catch (error) {
        logger.error(`[BOT]: Error processing mentioned message in community ${community.communityName}: ${error}`);
        await ctx.reply("❌ Message processing failed. Please try again later.");
      }
    } catch (error) {
      logger.error(`[BOT]: Error handling message: ${error}`);
    }
  }

  private async handlePollResults(ctx: Context) {
    try {
      const poll = ctx.pollAnswer;
      const tgPollId = poll?.poll_id;
      const userTgId = poll?.user?.id;
      const userTgUsername = poll?.user?.username;
      const yesVote = poll?.option_ids[0] === 0;

      logger.info(`[BOT]: Poll results received for poll ID ${tgPollId} from user ${userTgUsername}`);

      if (!tgPollId || !userTgId || !userTgUsername) {
        logger.warn(`[BOT]: Missing parameters for poll results: ${tgPollId}, ${userTgId}, ${userTgUsername}`);
        return;
      }

      const updateQuery = yesVote
        ? {
            $inc: { "value_aligned_posts.$.votes.count": 1 },
            $push: { "value_aligned_posts.$.votes.alignedUsers": { userTgId: userTgId.toString(), userTgUsername } },
          }
        : {
            $inc: { "value_aligned_posts.$.votes.count": 1 },
            $push: { "value_aligned_posts.$.votes.notAlignedUsers": { userTgId: userTgId.toString(), userTgUsername } },
          };

      const result = await CultureBook.updateOne({ "value_aligned_posts.tgPollId": tgPollId }, updateQuery);

      if (result.modifiedCount === 0) {
        logger.warn(`[BOT]: No post updated for poll ID ${tgPollId}`);
        return;
      }
      
      // Create a wallet for the user if they don't have one
      const wallet = await getOrCreateWallet(userTgId.toString(), userTgUsername);

      logger.info(`[BOT]: Poll results saved for poll ID ${tgPollId}`);
    } catch (error) {
      logger.warn(`[BOT]: Error handling poll results: ${error}`);
    }
  }

  // ! CRON JOB HANDLERS

  // * ANALYZE COMMUNITIES WITH AI: Analyzes all communities with AI and sends a message to the community
  public async analyzeCommunitiesWithAI() {
    try {
      const communities = await getAllCultureBotCommunities();

      // Process each community
      for (const community of communities) {
        try {
          logger.info(`[BOT]: Processing messages for community: ${community.communityName}`);

          const message = await processCommunity(community);
          if (!message) {
            continue;
          }

          await this.bot.api.sendMessage(community.chatId, message, { parse_mode: "HTML" });
        } catch (error) {
          logger.warn(`[BOT]: Error processing community ${community.communityName}: ${error}`);
          continue;
        }
      }

      return true;
    } catch (error) {
      logger.error(`[BOT]: Error in AI Community Analyzer: ${error}`);
      return false;
    }
  }

  // * CHECK FOR DUE MESSAGES: Checks for due messages in all culture books and processes them
  public async checkForDuePosts() {
    try {
      const cultureBooks = await getAllCultureBooksWithCultureBotCommunity();
      for (const cultureBook of cultureBooks) {
        // Process each culture book
        const cultureBotCommunity = cultureBook.cultureBotCommunity as ICultureBotCommunity;
        const duePosts = await getDuePosts(cultureBook);
        if (!duePosts) continue;
        for (const post of duePosts) {
          // Process each due message
          try {
            await processDuePosts(this.bot, this.provider, cultureBook, post);
          } catch (error) {
            logger.warn(
              `[BOT]: Error processing post ID ${post._id} in culture book ID ${cultureBook._id} for community ${cultureBotCommunity.communityName}: ${error}`
            );
            continue;
          }
        }
      }
      return true;
    } catch (error) {
      logger.error(`Error while checking for due posts: ${error}`);
      return false;
    }
  }

  // * SEND MESSAGE FOR REWARDS: Sends a message to the community for rewards distribution
  public async sendMessageForRewards(
    book: ICultureBook,
    usersGettingRewarded: { posterTgId: string; posterUsername: string }[] | null
  ) {
    try {
      const cultureBotCommunity = book.cultureBotCommunity as ICultureBotCommunity;
      const cultureToken = book.cultureToken as ICultureToken;

      if (usersGettingRewarded?.length === 0 || !usersGettingRewarded) {
        await this.bot.api.sendMessage(cultureBotCommunity.chatId, NO_REWARD_MESSAGE(cultureToken.symbol));
        logger.info(`[BOT]: No rewards to distribute for community ${cultureBotCommunity.communityName}`);
      } else {
        const users = usersGettingRewarded.map((user) => `@${user.posterUsername}`);
        // remove duplicates from the array
        const uniqueUsers = [...new Set(users)];
        await this.bot.api.sendMessage(cultureBotCommunity.chatId, REWARDED_MESSAGE(uniqueUsers, cultureToken.symbol), {
          parse_mode: "Markdown",
        });
        logger.info(
          `[BOT]: Message for rewards distributed successfully sent for community ${cultureBotCommunity.communityName}`
        );
      }
    } catch (error) {
      logger.warn(`[BOT]: Error sending message for rewards: ${error}`);
      throw new Error("Error sending message for rewards");
    }
  }

  // * SEND MESSAGE FOR REWARDS: Sends a message to the community for rewards distribution
  public async sendMessageForEngagementRewards(
    book: ICultureBook,
    usersGettingEngagementRewards: { posterTgId: string; posterUsername: string }[] | null
  ) {
    try {
      const cultureBotCommunity = book.cultureBotCommunity as ICultureBotCommunity;
      const cultureToken = book.cultureToken as ICultureToken;

      if (usersGettingEngagementRewards?.length === 0 || !usersGettingEngagementRewards) {
        // await this.bot.api.sendMessage(cultureBotCommunity.chatId, NO_REWARD_MESSAGE(cultureToken.symbol));
        logger.info(`[BOT]: No rewards to distribute for community ${cultureBotCommunity.communityName}`);
      } else {
        const users = usersGettingEngagementRewards.map((user) => `@${user.posterUsername}`);
        // remove duplicates from the array
        const uniqueUsers = [...new Set(users)];
        await this.bot.api.sendMessage(cultureBotCommunity.chatId, ENGAGEMENT_REWARDED_MESSAGE(uniqueUsers, cultureToken.symbol), {
          parse_mode: "Markdown",
        });
        logger.info(
          `[BOT]: Message for engagement rewards distributed successfully sent for community ${cultureBotCommunity.communityName}`
        );
      }
    } catch (error) {
      logger.warn(`[BOT]: Error sending message for rewards: ${error}`);
      throw new Error("Error sending message for rewards");
    }
  }

  async start() {
    try {
      await this.bot.start();
      logger.info("Telegram bot started.");
    } catch (error) {
      logger.error("Error starting Telegram bot:", error);
    }
  }
}