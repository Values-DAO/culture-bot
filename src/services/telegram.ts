import { Bot, Context } from "grammy";
import { config } from "../config/config";
import { logger } from "../utils/logger";
import { CultureBotCommunity } from "../models/community";
import { TrustPools } from "../models/trustpool";
import { ethers } from "ethers";
import { PinataSDK } from "pinata-web3";
import { CultureBook } from "../models/cultureBook";
import axios from "axios";
import { connectDB } from "./database";
import { CryptoUtils } from "../utils/cryptoUtils";
import { Wallet } from "../models/wallet";
import { Alchemy, Network } from "alchemy-sdk";
import { isDefined } from "../actions/sanity/validateInputs";
import { COMMANDS_MESSAGE, POLL_MESSAGE, WELCOME_MESSAGE } from "../constants/messages";
import { type Schema } from "mongoose";
import { createCultureBotCommunity, findCultureBookByTrustPoolId, findCultureBotCommunityByChatId, findTrustPool, storeMessageInDB, storeToCultureBook } from "../actions/database/queries";
import type { IPFSResponse } from "../types/types";
import { checkBotMention, createAndLaunchPoll, handleMessageWithoutMention } from "../actions/telegram/utils";

// TODO: Change trustpool functionality.

export class TelegramService {
  private bot: Bot;
  private provider: ethers.JsonRpcProvider;

  constructor() {
    this.bot = new Bot(config.telegramToken);
    this.setupHandlers();
    this.provider = new ethers.JsonRpcProvider(config.baseSepoliaRpc);
  }

  private setupHandlers() {
    this.bot.command("start", (ctx: Context) => this.handleStart(ctx));
    this.bot.command("commands", (ctx: Context) => this.handleCommands(ctx));
    this.bot.command("trustpool", (ctx: Context) => this.handleTrustPool(ctx));
    this.bot.command("wallet", (ctx: Context) => this.getWalletDetails(ctx));
    this.bot.command("exportwallet", (ctx: Context) => this.handleExportWallet(ctx));
    this.bot.on("message:photo", async (ctx: Context) => this.handleMessage(ctx));
    this.bot.on("message", (ctx: Context) => this.handleMessage(ctx));
  }

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

      if(!isDefined(username, userId, chatId, communityName)) {
        logger.warn("[BOT]: Received /trustpool command with missing parameters.");
        await ctx.reply("❌ Please provide all required parameters.");
        return;
      }
      
      logger.info(`[BOT]: Received /trustpool command from username: ${username} in community: ${communityName}`);

      const trustPool = await findTrustPool(ctx);
      if (!trustPool) return
      
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

  // * CRON JOB API CALL
  // * API will hit this endpoint and this function will run
  public async cronJobResponder() {
    try {
      const communities = await CultureBotCommunity.find();

      for (const community of communities) {
        const chatId = community.chatId;
        logger.info(`Processing messages for community: ${community.communityName}`);

        if (community.messages.length === 0) {
          logger.info(`No total messages to process in community ${community.communityName}`);
          continue;
        }

        let trustpool = await TrustPools.findById(community.trustPool);
        if (!trustpool) {
          logger.error(`Trust pool not found for community: ${community.communityName}`);
          continue;
        }

        const response = await axios.post(`${config.backendUrl}/cultureBook/generate`, {
          trustPoolId: trustpool._id,
        });

        if (response.status !== 200) {
          logger.error(`Error generating culture book for community ${community.communityName}`);
          return false;
        }

        const posts = await axios.get(`${config.backendUrl}/cultureBook/pre-onchain/get?trustPoolId=${trustpool._id}`);

        // Group posts by contributor and remove duplicates
        const postsByContributor = posts.data.data.posts.reduce((acc: any, post: any) => {
          if (!acc[post.posterUsername]) {
            acc[post.posterUsername] = new Set();
          }
          acc[post.posterUsername].add(post.content);
          return acc;
        }, {});

        // Convert Sets back to arrays
        for (const username in postsByContributor) {
          postsByContributor[username] = Array.from(postsByContributor[username]);
        }

        const topContributors = Object.keys(postsByContributor);

        if (topContributors.length === 0) {
          logger.info(`No top contributors found for community: ${community.communityName}`);
          const message = `
🌟 Culture Book Update 📚

Hey everyone! Seems like this community has been quiet this week. No top contributors found. 🤷‍♂️

Try sharing some value-aligned content next week to preserve your culture onchain for generations to come!

📝 You can tag me in a message to add it to your Culture Book.
`;
          await this.bot.api.sendMessage(chatId, message, { parse_mode: "HTML" });
          continue;
        }

        logger.info(`Top contributors: ${topContributors.join(", ")}`);

        // Create formatted message with grouped posts (no duplicates)
        let contributorSection = topContributors
          .map((username: string, index: number) => {
            const posts = postsByContributor[username];
            const numberedPosts = posts.map((post: string, i: number) => `   ${i + 1}. ${post}`).join("\n\n");
            return `${index + 1}. @${username} (${posts.length} post(s)):\n\n${numberedPosts}`;
          })
          .join("\n\n");

        const message = `
🌟 Culture Book Update 📚

Hey everyone! This week's Culture Book is ready.

👉 Check it out here: [Culture Book](https://app.valuesdao.io/trustpools/${trustpool._id}/culture)

📝 Top Contributors and Their Posts:

${contributorSection}

Tip: You can also tag me in a message to add it to your Culture Book.
`;

        await this.bot.api.sendMessage(chatId, message, { parse_mode: "HTML" });
      }
      return true;
    } catch (error) {
      logger.error(`Error in cronJobResponder: ${error}`);
      return false;
    }
  }

  // * CRON JOB POLL DATABASE
  // * This route is for the cron job to poll the database for new messages to be processed
  public async pollDatabase() {
    try {
      await connectDB();

      const cultureBooks = await CultureBook.find({}).populate("cultureBotCommunity");

      for (const cultureBook of cultureBooks) {
        // skip if cultureBook has no community
        if (!cultureBook.cultureBotCommunity) {
          continue;
        }

        // @ts-ignore
        // const value_aligned_posts = cultureBook.value_aligned_posts.filter((post) => post.status === "pending").filter((post) => post.eligibleForVoting);
        const value_aligned_posts = cultureBook.value_aligned_posts
          .filter((post) => post.status === "pending")
          .filter((post) => post.votingEndsAt < new Date())
          .filter((post) => post.eligibleForVoting);

        if (value_aligned_posts.length === 0) {
          logger.info(
            `No messages to process for culture book ${cultureBook._id} in community ${cultureBook.cultureBotCommunity.communityName}`
          );
          continue;
        } else {
          logger.info(
            `Processing ${value_aligned_posts.length} messages for community ${cultureBook.cultureBotCommunity.communityName}`
          );
        }

        for (const post of value_aligned_posts) {
          // Stop the poll and process the messages
          try {
            // TODO: This code is sh1t, if the message processing fails later on then the poll is stopped but doesn't get processed
            // TODO: and in future, you cannot stop the poll again, it gives error so there's no way to get the results as well.
            const result = await this.bot.api.stopPoll(cultureBook.cultureBotCommunity.chatId, post.pollId);
            const yesVotes = result.options[0].voter_count;
            const noVotes = result.options[1].voter_count;

            if (yesVotes >= noVotes) {
              // now the message is eligible for posting onchain
              // need to avoid duplication, so if the post already exists onchain, skip it
              // onchain posts have onchain field set to true
              // check messages by messageTgId
              // @ts-ignore
              const existingPost = cultureBook.value_aligned_posts.find(
                (p) => p?.messageTgId && p?.messageTgId === post?.messageTgId && p.onchain
              );

              if (existingPost) {
                console.log(`Post ${post._id} already exists onchain. Skipping...`);
                post.eligibleForVoting = false;
                post.onchain = false;
                post.votes.count = yesVotes - noVotes;
                await cultureBook.save();

                await this.bot.api.sendMessage(
                  cultureBook.cultureBotCommunity.chatId,
                  `🎉 The community has spoken! This message has been deemed value-aligned and is now immortalized onchain. Thanks for keeping our culture alive! Check it out on the [Culture Book](https://app.valuesdao.io/trustpools/${cultureBook.trustPool}/culture) ✨`,
                  { reply_to_message_id: post.messageTgId, parse_mode: "Markdown" }
                );
                continue;
              }

              const response = await this.completeMessageProcessing(cultureBook, post, result);
              if (!response) {
                logger.error(`Error processing message ${post._id} for culture book ${cultureBook._id}`);
                continue;
              } else {
                logger.info(
                  `Message ${post._id} processed for community ${cultureBook.cultureBotCommunity.communityName}`
                );
                logger.info(
                  `Creating wallet for user ${post.posterTgId}::${post.posterUsername} for posting message ${post._id} in community ${cultureBook.cultureBotCommunity.communityName}...`
                );
                const wallet = await this.createWallet(post.posterTgId, post.posterUsername);
                // const res = await depositRewards(wallet.publicKey, rewardAmount);
                if (!wallet) {
                  logger.error(
                    `Error creating wallet for user ${post.posterUsername} for posting message ${post._id} in community ${cultureBook.cultureBotCommunity.communityName}`
                  );
                  continue;
                }
              }
            } else {
              post.status = "rejected";
              post.votes.count = yesVotes - noVotes;
              post.eligibleForVoting = false;
              await cultureBook.save();

              logger.info(
                `Message ${post._id} rejected for community ${cultureBook.cultureBotCommunity.communityName}`
              );
            }

            // reply to the community
            const message =
              yesVotes >= noVotes
                ? `🎉 The community has spoken! This message has been deemed value-aligned and is now immortalized onchain. Thanks for keeping our culture alive! Check it out on the [Culture Book](https://app.valuesdao.io/trustpools/${cultureBook.trustPool}/culture) ✨`
                : "❌ The community has decided this message doesn’t align with our values. Keep sharing, and let’s continue building our story together!";

            await this.bot.api.sendMessage(cultureBook.cultureBotCommunity.chatId, message, {
              reply_to_message_id: post.messageTgId,
              parse_mode: "Markdown",
            });
          } catch (error) {
            logger.error(
              `Error processing post ${post._id} in culture book ${cultureBook._id} for community ${cultureBook.cultureBotCommunity.communityName}:`,
              error
            );
            continue;
          }
        }
      }
      return true;
    } catch (error) {
      logger.error(`Error in pollDatabase: ${error}`);
      return false;
    }
  }

  // * CREATE WALLET
  // * Creates a wallet for the user who posted the message that went onchain
  private async createWallet(posterTgId: string, posterUsername: string) {
    try {
      // skip if wallet already exists
      const existingWallet = await Wallet.findOne({ telegramId: posterTgId });
      if (existingWallet) {
        logger.info(`Wallet already exists for user ${posterTgId}::${posterUsername}`);
        return existingWallet;
      }

      const wallet = ethers.Wallet.createRandom();
      const encryptedPrivateKey = CryptoUtils.encrypt(wallet.privateKey);

      const userWallet = await Wallet.create({
        telegramId: posterTgId,
        telegramUsername: posterUsername,
        publicKey: wallet.address,
        privateKey: encryptedPrivateKey,
      });

      logger.info(`Wallet created for user ${posterTgId}::${posterUsername}`);

      return userWallet;
    } catch (error) {
      logger.error(`Error creating wallet for user ${posterTgId}::${posterUsername}: ${error}`);
      return false;
    }
  }

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
        await ctx.reply("No wallet found for user.");
        return;
      }

      // Fetch ETH balance
      const balance = await this.provider.getBalance(wallet.publicKey);
      const balanceInEth = ethers.formatEther(balance);

      const settings = {
        apiKey: config.alchemyKey,
        network: Network.BASE_MAINNET,
      };
      const alchemy = new Alchemy(settings);

      // Fetch ERC-20 token balances using Alchemy
      const tokenBalancesResponse = await alchemy.core.getTokenBalances(wallet.publicKey);

      // Prepare a concise response for token balances
      let tokensMessage = "";
      if (tokenBalancesResponse.tokenBalances.length > 0) {
        for (const token of tokenBalancesResponse.tokenBalances) {
          const { contractAddress, tokenBalance } = token;

          // Skip if token balance is null or undefined
          if (!tokenBalance) continue;

          // Fetch token metadata
          const metadata = await alchemy.core.getTokenMetadata(contractAddress);

          // Convert token balance to a readable format using ethers.js BigInt
          const balance = BigInt(tokenBalance);
          const readableBalance =
            metadata.decimals && metadata.decimals > 0
              ? ethers.formatUnits(balance, metadata.decimals)
              : balance.toString();

          // Only show tokens with non-zero balance
          if (readableBalance !== "0" && readableBalance !== "0.0") {
            tokensMessage += `• ${metadata.name || "Unknown Token"} (${
              metadata.symbol || "N/A"
            }): ${readableBalance}\n`;
          }
        }
      }

      if (!tokensMessage) {
        tokensMessage = "No ERC-20 tokens found in this wallet.";
      }

      // Construct the final message
      const message = `
💳 Your Wallet's Public Key: \`${wallet.publicKey}\`

💰 Balance: ${balanceInEth} ETH

💸 Tokens:
${tokensMessage}`;

      // Send the reply
      await ctx.reply(message, { parse_mode: "Markdown" });
    } catch (error) {
      logger.error(`Error getting wallet details: ${error}`);
      await ctx.reply("Failed to get wallet details. Please try again.");
    }
  }

  // * EXPORT WALLET
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
        await ctx.reply("No wallet found for user.");
        return;
      }

      // Decrypt the private key
      const decryptedPrivateKey = CryptoUtils.decrypt(wallet.privateKey);

      const message = `
🔐 *Wallet Export for ${wallet.telegramUsername}*

💼 *Public Address:* \`${wallet.publicKey}\`

🔑 *Private Key:* \`${decryptedPrivateKey}\`

⚠️ *IMPORTANT:*
- Keep this private key secure
- Never share it with anyone
- Store it safely offline
- Delete this message after saving the key
      `;

      await ctx.reply(message, { parse_mode: "Markdown" });
    } catch (error) {
      logger.error(`Error exporting wallet: ${error}`);
      await ctx.reply("Failed to export wallet. Please try again.");
    }
  }

  // This function is for processing individual messages when they are due
  private async completeMessageProcessing(cultureBook: any, post: any, result: any) {
    try {
      // Get photo if present
      let messageContent: any = { text: post.content };
      if (post.hasPhoto) {
        const photoUrl = await this.getPhotoUrl(post.photoFileId);
        if (photoUrl) {
          messageContent.photo = {
            url: photoUrl,
            file_id: post.photoFileId,
          };
        }
      }

      // Upload the message and photo to IPFS
      const response = await this.storeMessageOnIpfs(messageContent);
      if (!response) {
        throw new Error("Error storing message on IPFS");
      }

      // Upload the IPFS CID onchain
      const transactionHash = await this.storeMessageOnChain(response.IpfsHash);

      // Update value_aligned_posts array in culture book with transaction hash, IPFS hash, photo URL and status
      post.transactionHash = transactionHash;
      post.ipfsHash = response.IpfsHash;
      post.photoUrl = response?.gateway_url;
      post.status = "approved";
      post.eligibleForVoting = false;
      post.onchain = true;
      post.votes.count = result.options[0].voter_count - result.options[1].voter_count;

      await cultureBook.save();
      return true;
    } catch (error) {
      logger.error("Error completing message processing:", error);
      return false;
    }
  }

  private async storeMessageOnIpfs(content: { text: string; photo: any }): Promise<IPFSResponse | undefined> {
    try {
      const pinata = new PinataSDK({
        pinataJwt: config.pinataJwt,
        pinataGateway: config.pinataGateway,
      });

      if (content.text && !content.photo) {
        const file = new File([content.text], "message.txt", { type: "text/plain" });
        const upload = await pinata.upload.file(file);
        logger.info("Uploaded text message to IPFS:");
        console.log(upload);
        return upload;
      } else {
        // If it's a photo message, we need to:
        // 1. Download the image from Telegram
        // 2. Upload the image to IPFS
        // 3. Create a JSON with the text and IPFS image hash

        if (content.photo?.url) {
          try {
            // Download image from Telegram
            const imageBuffer = await this.downloadImage(content.photo.url);

            // Upload image to IPFS first
            const imageFile = new File([imageBuffer], "image.jpg", { type: "image/jpeg" });
            const imageUpload = await pinata.upload.file(imageFile);

            // Create final content object with image IPFS hash
            const finalContent = {
              text: content.text,
              image: {
                ipfsHash: imageUpload.IpfsHash,
                // TODO: Can do this for normal messages too
                gateway_url: `https://violet-many-felidae-752.mypinata.cloud/ipfs/${imageUpload.IpfsHash}`,
              },
            };

            // Upload the metadata JSON
            const metadataFile = new File([JSON.stringify(finalContent)], "message.json", { type: "application/json" });

            const metadataUpload = await pinata.upload.file(metadataFile);
            logger.info("Uploaded photo message to IPFS:");
            console.log(metadataUpload);
            // @ts-ignore
            metadataUpload.gateway_url = finalContent.image.gateway_url;
            return metadataUpload;
          } catch (error) {
            logger.error("Error processing image:", error);
            throw error;
          }
        }

        // Fallback to just text if no photo
        const file = new File([content.text], "message.txt", { type: "text/plain" });
        return await pinata.upload.file(file);
      }
    } catch (error) {
      logger.error("Error storing message on IPFS:", error);
      return;
    }
  }

  private async getPhotoUrl(photoFileId: string): Promise<string | undefined> {
    try {
      // This URL is temporary and will expire, however, we can use the file_id to get the photo URL anytime
      console.log("Photo File Id: ", photoFileId);
      const file = await this.bot.api.getFile(photoFileId);
      return `https://api.telegram.org/file/bot${config.telegramToken}/${file.file_path}`;
    } catch (error) {
      logger.error(`Error getting photo URL: ${error}`);
      return undefined;
    }
  }

  private async downloadImage(url: string): Promise<Buffer> {
    console.log("URL: ", url);
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to download image");
    console.log("Response: ", response);
    return Buffer.from(await response.arrayBuffer());
  }

  private async storeMessageOnChain(ipfsHash: string): Promise<string> {
    const wallet = new ethers.Wallet(config.privateKey, this.provider);
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();

    // Encode message data with IPFS hash
    const messageData = abiCoder.encode(["string"], [ipfsHash]);

    const tx = await wallet.sendTransaction({
      to: wallet.address,
      data: messageData,
      value: 0,
      gasLimit: 150000,
    });

    const receipt = await tx.wait();
    if (!receipt?.hash) throw new Error("Transaction failed");

    logger.info(`Stored message onchain with transaction hash: ${receipt.hash}`);

    return receipt.hash;
  }

  // * HANDLE MESSAGE: Handles tagged and normal text and photo messages from the community.
  // TODO: Handle case when a photo greater than 20 mb is sent
  private async handleMessage(ctx: Context) {
    if (ctx.message?.text?.startsWith("/")) { // Ignore commands
      return;
    }

    try {
      const chatId = ctx.chat?.id;
      const senderUsername = ctx.from?.username || "unknown";
      const senderTgId = ctx.from?.id;

      if(!isDefined(chatId, senderUsername, senderTgId)) {
        logger.warn("[BOT]: Received message with missing parameters.");
        return;
      }

      const community = await findCultureBotCommunityByChatId(chatId!.toString());
      if (!community) { 
        // TODO: Upon adding the bot to the community, this gets triggered cause the community isn't initialized yet
        logger.warn(`[BOT]: Community not found for chat ID: ${chatId} or maybe new community just got initiated!`);
        return
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
          messageToProcess.text?.replace(new RegExp((process.env.ENV === "prod" ? "@culturepadbot" : "@culturepadtestbot"), "g"), "").trim() === "" &&
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
        const pollId = await createAndLaunchPoll(ctx, messageToProcess);
        // const votingEndsAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24 hours from now
        const votingEndsAt = new Date(Date.now() + 1000 * 5); // 5 seconds from now // TODO: Change this to 24 hours after testing
        
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
          pollId: pollId,
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

  async start() {
    try {
      await this.bot.start();
      logger.info("Telegram bot started.");
    } catch (error) {
      logger.error("Error starting Telegram bot:", error);
    }
  }
}