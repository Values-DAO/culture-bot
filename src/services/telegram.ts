import { Bot, Context } from "grammy";
import { config } from "../config/config";
import { logger } from "../utils/logger";
import { CultureBotCommunity } from "../models/community";
import { TrustPools } from "../models/trustpool";
import { CultureBotMessage } from "../models/message";
import { ethers } from "ethers";
import { PinataSDK } from "pinata-web3";
import { CultureBook } from "../models/cultureBook";
import axios from "axios";
import { connectDB } from "./database";
import { CryptoUtils } from "../utils/cryptoUtils";
import { Wallet } from "../models/wallet";
import { Alchemy, Network } from "alchemy-sdk";
import { isDefined } from "../actions/sanity/validateInputs";
import { WELCOME_MESSAGE } from "../constants/messages";

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

  private async handleCommands(ctx: Context) {
    const username = ctx.from?.username || "unknown";
    logger.info(`Received /commands command from ${username}`);
    const message = `
📚 *Culture Bot Commands* 🤖
- /trustpool <link>: Connect to a trust pool.
`;

    await ctx.reply(message, { parse_mode: "Markdown" });
  }

  // * SET TRUST POOL COMMAND
  // * Sets the trust pool for the community.
  private async handleTrustPool(ctx: Context) {
    try {
      const username = ctx.from?.username || "unknown";
      const userId = ctx.from?.id;
      const chatId = ctx.chat?.id;
      const communityName = ctx.chat?.title || username;

      if (!userId || !chatId || !username) {
        await ctx.reply("Error: Could not determine username or chat ID.");
        return;
      }

      const args = ctx.message?.text?.split(" ").slice(1);
      if (!args || args.length < 1) {
        await ctx.reply("Error: Please use format: /trustpool <link>");
        return;
      }

      const [trustPoolLink] = args;

      const trustPoolId = trustPoolLink.split("/")[4];

      ctx.reply(`Connecting to trust pool...`);

      // Check if community already exists
      // This is working fine
      const existingCommunity = await CultureBotCommunity.findOne({ trustPool: trustPoolId });
      if (existingCommunity) {
        await ctx.reply("This trust pool is already connected to a community ✅.");
        return;
      }

      // Create new community
      // Check if the trust pool exists or not
      // This is working fine
      const trustPool = await TrustPools.findById(trustPoolId);
      if (!trustPool) {
        await ctx.reply("Error: Trust pool not found.");
        return;
      }

      const trustPoolName = trustPool.name;
      logger.info(`Received /trustpool for ${trustPool._id}: ${trustPoolName} from ${username}`);

      const community = await CultureBotCommunity.create({
        trustPool: trustPool._id,
        trustPoolName,
        communityName,
        initiator: username,
        initiatorTgId: userId.toString(),
        chatId: chatId.toString(),
      });

      const cultureBook = await CultureBook.findOne({ trustPool: trustPool._id });

      cultureBook.cultureBotCommunity = community._id;
      community.cultureBook = cultureBook._id;
      trustPool.cultureBotCommunity = community._id;

      await cultureBook.save();
      await community.save();
      await trustPool.save();

      await ctx.reply(`Community ${communityName} connected to trust pool ${trustPoolName} 🎉.`);
      logger.info(`Community ${communityName} connected to trust pool ${trustPoolName}.`);
    } catch (error) {
      logger.error("Error handling /trustpool command:", error);
      await ctx.reply("Failed to connect to trust pool. Please try again.");
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
              `Error processing message ${post._id} in culture book ${cultureBook._id} for community ${cultureBook.cultureBotCommunity.communityName}:`,
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
      const file = await this.bot.api.getFile(photoFileId);
      return `https://api.telegram.org/file/bot${config.telegramToken}/${file.file_path}`;
    } catch (error) {
      logger.error(`Error getting photo URL: ${error}`);
      return undefined;
    }
  }

  private async downloadImage(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to download image");
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

  // * HANDLE MESSAGE
  // * Handles incoming messages from the community.
  private async handleMessage(ctx: Context) {
    if (ctx.message?.text?.startsWith("/")) {
      return;
    }

    try {
      const chatId = ctx.chat?.id;
      const senderUsername = ctx.from?.username || "unknown";
      const senderTgId = ctx.from?.id;

      if (!chatId || !senderUsername || !senderTgId) {
        return;
      }

      const community = await CultureBotCommunity.findOne({ chatId });
      if (!community || !community.isWatching) {
        return;
      }

      const repliedMessage = ctx.message?.reply_to_message;
      const currentMessage = ctx.message;

      // Check for bot mention
      const mentionsBot =
        currentMessage?.entities?.some(
          (entity) =>
            entity.type === "mention" &&
            currentMessage?.text?.slice(entity.offset, entity.offset + entity.length) === "@culturepadbot"
        ) ||
        currentMessage?.caption_entities?.some(
          (entity) =>
            entity.type === "mention" &&
            currentMessage?.caption?.slice(entity.offset, entity.offset + entity.length) === "@culturepadbot"
        );

      if (!mentionsBot) {
        // If no mention, then store the current message in db
        // Ignore photo messages without caption
        if (currentMessage?.photo && !currentMessage.caption) {
          // If not tagged bot and there is no caption, ignore photo messages
          logger.info("Ignoring photo message without caption.");
          return;
        }
        await this.storeMessageInDB(currentMessage, community);
        return;
      }

      // Determine which message to process --> Now that we have a mention, we will process the replied message if it exists
      const messageToProcess = repliedMessage || currentMessage;
      logger.info("Message to process:");
      console.log(messageToProcess);
      if (!messageToProcess) return;

      // Process the message for storage
      const processingMsg = await ctx.reply("📝 Processing message...");

      try {
        // Handle photo messages
        let messageContent: any = {
          text: messageToProcess.text || messageToProcess.caption || "", // text or caption or none (for photo messages)
        };

        if (messageToProcess.photo) {
          messageContent.photo = {
            file_id: messageToProcess.photo[messageToProcess.photo.length - 1].file_id, // Last photo in the array for highest resolution
          };
        }

        // Store in message database
        const message = await this.storeMessageInDB(messageToProcess, community, {
          ...messageContent,
        });

        // Flow:
        // Store all fields (text, hasPhoto, photoFileId) in message database and value_aligned_posts array in culture book
        // Then the voting starts
        // Once the voting is over, message (transactionHash, ipfsHash, photoUrl) and value_aligned_posts (transactionHash, ipfsHash, photoUrl, status) array are updated with the voting results
        // All set.

        // Launch the poll to start voting
        const poll = await ctx.api.sendPoll(
          ctx.chat?.id.toString()!,
          "Is this message value-aligned with our community?",
          [{ text: "Yes" }, { text: "No" }],
          {
            is_anonymous: true,
            allows_multiple_answers: false,
            reply_to_message_id: messageToProcess.message_id,
          }
        );

        const pollId = poll.message_id;
        const votingEndsAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24 hours from now
        // const votingEndsAt = new Date(Date.now() + 1000 * 60 * 1); // 1 minute for testing
        // const votingEndsAt = new Date(Date.now() + 1000 * 60 * 2); // 2 minutes for testing
        // const votingEndsAt = new Date(Date.now() + 1000 * 20); // 20 seconds for testing

        message.timestamp = new Date(messageToProcess.date * 1000);
        message.votingEndsAt = votingEndsAt;
        message.pollId = pollId;

        logger.info(
          `Poll started for message sent by ${senderUsername} in community ${community.communityName}. Voting ends at ${votingEndsAt}`
        );

        const stored = await this.storeToCultureBook(message, community);
        if (!stored) {
          await ctx.reply("❌ Storage failed. Please try again.");
          return;
        }

        await ctx.api.editMessageText(
          chatId,
          processingMsg.message_id,
          `🚨 A new message has been tagged for evaluation. Please vote in the poll below to decide if it aligns with our community's values. \n\n⏳ The poll is open for the next 24 hours, so don’t miss your chance to contribute. \n\nThe majority vote will determine if it gets added onchain. Let’s preserve our culture together!`,
          { parse_mode: "Markdown" }
        );
      } catch (error) {
        logger.error("Storage failed:", error);
        await ctx.reply("❌ Storage failed. Please try again.");
      }
    } catch (error) {
      logger.error("Error handling message:", error);
    }
  }

  private async storeMessageInDB(message: any, community: any, messageContent?: any): Promise<any> {
    const text = message.text || message.caption || "";

    const storedMessage = await CultureBotMessage.create({
      text: text.replace(/@culturepadbot/g, "").trim(),
      senderUsername: message.from?.username || "unknown",
      senderTgId: message.from?.id.toString(),
      messageTgId: message.message_id,
      community: community._id,
      hasPhoto: !!message.photo,
      photoFileId: messageContent?.photo?.file_id,
    });

    // TODO: Fix this frigging error
    // @ts-ignore
    community.messages.push(storedMessage._id);
    await community.save();

    logger.info(`Stored message in database. Community: ${community.communityName} from ${message.from?.username}`);

    return storedMessage;
  }

  private async storeToCultureBook(message: any, community: any): Promise<any> {
    const content = message.text;

    return await CultureBook.findOneAndUpdate(
      { trustPool: community.trustPool },
      {
        $push: {
          value_aligned_posts: {
            id: message._id,
            posterUsername: message.senderUsername,
            posterTgId: message.senderTgId,
            messageTgId: message.messageTgId,
            content: content.replace(/@culturepadbot/g, "").trim(),
            timestamp: message.timestamp,
            title: "From Telegram Community",
            source: "Telegram",
            onchain: false,
            eligibleForVoting: true,
            hasPhoto: message.hasPhoto,
            photoFileId: message.photoFileId,
            status: "pending",
            votingEndsAt: message.votingEndsAt,
            pollId: message.pollId,
          },
        },
      },
      { new: true }
    );
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