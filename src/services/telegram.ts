import { Bot, Context } from "grammy";
import { config } from "../config/config";
import { logger } from "../utils/logger";
import { CultureBotCommunity, type Community } from "../models/community";
import { TrustPools } from "../models/trustpool";
import { CultureBotMessage } from "../models/message";
import { ethers } from "ethers";
import { PinataSDK } from "pinata-web3";
import { CultureBook } from "../models/cultureBook";
import axios from "axios";

// TODO: Change trustpool functionality.
// TODO: Flexibility for other bots to run in the sa  me chat. Specialize the bot trigger.  
// TODO: Support for different types of messages.

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
    // this.bot.command("wallet", (ctx: Context) => this.handleWallet(ctx));
    // this.bot.command("balance", (ctx: Context) => this.handleBalance(ctx));
    // this.bot.command("exportwallet", (ctx: Context) => this.handleExportWallet(ctx));
    // this.bot.command("watch", (ctx: Context) => this.handleStartWatching(ctx));
    // this.bot.command("stopwatch", (ctx: Context) => this.handleStopWatching(ctx));
    // this.bot.command("details", (ctx: Context) => this.handleDetails(ctx));
    // this.bot.command("getmessage", (ctx: Context) => this.handleGetMessage(ctx));

    this.bot.on("message", (ctx: Context) => this.handleMessage(ctx));
  }

  // // * Check if the user is the initiator of the community
  // private async isInitiator(ctx: Context): Promise<boolean> {
  //   const groupId = ctx.chat?.id.toString();
  //   const community = await CultureBotCommunity.findOne({ chatId: groupId });

  //   if (!community) {
  //     return false;
  //   }

  //   return community.initiatorTgId === ctx.from?.id.toString(); // Check if the user ID matches the initiator ID
  // }

  // * START COMMAND
  // * Provides a welcome message, bot functionality and instructions on how to set up the bot.
  private async handleStart(ctx: Context) {
    const username = ctx.from?.username || "unknown";
    logger.info(`Received /start command from ${username}`);
    const welcomeMessage = `
🌟 Culture Bot 🚀

I'm here to identify value-aligned content and post your community's lore/culture onchain in your Culture Book! 

🛠️ To get started, use /trustpool <link> to link your community to a trust pool. Get the link from [ValuesDAO](https://app.valuesdao.io/trustpools).
   
I will summarise the most value-aligned content every Friday and post it onchain, tag members who are creating cultural content here.

You can also tag me in a message to add it to your Culture Book.

Preserve your culture with Culture Bot!  🌍🔗
`;

    await ctx.reply(welcomeMessage, { parse_mode: "Markdown" });
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

      const trustPoolId = trustPoolLink.split("/").pop();
      
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
      // In all the communities that the bot is in, send a message to the community
      
      // Find all communities
      const communities = await CultureBotCommunity.find();

      for (const community of communities) {
        const chatId = community.chatId;
        
        logger.info(`Processing messages for community: ${community.communityName}`);
        
        // If no messages in the community, skip
        if (community.messages.length === 0) {
          logger.info("No messages to process in community:", community.communityName);
          continue;
        }
        
        let trustpool = await TrustPools.findById(community.trustPool);
        if (!trustpool) {
          logger.error("Trust pool not found for community:", community.communityName);
          continue;
        }
        
        // call the backend api
        const response = await axios.post(`${config.backendUrl}/cultureBook/generate`, {
          trustPoolId: trustpool._id,
        })
        
        if (response.status !== 200) {
          logger.error("Error generating culture book for community:", community.communityName);
          return false;
        }
        
        // Get the top contributors
        const posts = await axios.get(`${config.backendUrl}/cultureBook/pre-onchain/get?trustPoolId=${trustpool._id}`);
        
        let topContributors = posts.data.data.posts.map((post: any) => post.posterUsername);
        
        // remove duplicates from top contributors
        topContributors = [...new Set(topContributors)];
        
        logger.info(`Top contributors: ${topContributors.join(", ")}`);
          
        const message = `
        🌟 Culture Book Update 📚

Hey everyone! This week’s Culture Book is ready.

👉 Check it out here: [Culture Book](https://staging.valuesdao.io/trustpools/${trustpool._id}/curate)

📝 Top Contributors for this week are:
${topContributors.map((contributor: string, i: number) => `${i + 1}. ${contributor}`).join("\n")}

🔔 What to do next?
1️⃣ Head to the Curate tab.
2️⃣ Upvote the content that you believe aligns with our values.

⏳ Voting Deadline: 24 hours from now!

🎁 Rewards:
	- Top contributors will receive $CULTURE tokens.
  - Voters will also receive $CULTURE tokens.
	- The selected posts will go onchain! 🎉

Let’s celebrate and reward value-aligned contributions. 🚀
        `;

        // send the message to the community
        await this.bot.api.sendMessage(chatId, message, { parse_mode: "Markdown" });
      }
      
      return true;
    } catch (error) {
      logger.error("Error in cronJobResponder:", error);
      return false;
    }
  }

  // * SET WALLET COMMAND
  // * Creates a new wallet for the community.
  // private async handleWallet(ctx: Context) {
  //   try {
  //     const chatId = ctx.chat?.id;
  //     if (!chatId) {
  //       await ctx.reply("Error: Could not determine chat ID.");
  //       return;
  //     }

  //     const community = await CultureBotCommunity.findOne({ chatId });

  //     if (!community) {
  //       await ctx.reply(
  //         "Error: Community not found. Please connect to a trust pool first using /trustpool <link>."
  //       );
  //       return;
  //     }

  //     if (community.privateKey) {
  //       await ctx.reply(`💳 Your Wallet's Public key: ${community.publicKey}`);
  //       return;
  //     }

  //     // Generate a new wallet
  //     const wallet = ethers.Wallet.createRandom();

  //     const encryptedPrivateKey = CryptoUtils.encrypt(wallet.privateKey);

  //     community.privateKey = encryptedPrivateKey;
  //     community.publicKey = wallet.address;
  //     await community.save();

  //     await ctx.reply(
  //       `✅ Wallet successfully created for the community: *${community.communityName}*.\n💳 *Public Key:* \`${wallet.address}\``
  //     , {parse_mode: "Markdown"});

  //     logger.info(`Wallet created for community ${community.communityName}.`);
  //   } catch (error) {
  //     logger.error("Error handling /wallet command:", error);
  //     await ctx.reply("Failed to create wallet. Please try again.");
  //   }
  // }

  // * BALANCE COMMAND
  // * Checks the balance of the community wallet.
  //   private async handleBalance(ctx: Context) {
  //     try {
  //       const chatId = ctx.chat?.id;
  //       if (!chatId) {
  //         await ctx.reply("Error: Could not identify chat.");
  //         return;
  //       }

  //       const community = await CultureBotCommunity.findOne({chatId});
  //       if (!community) {
  //         await ctx.reply("No trust pool connected. Please use /trustpool first.");
  //         return;
  //       }

  //       if (!community.publicKey) {
  //         await ctx.reply("No wallet created. Please use /wallet first.");
  //         return;
  //       }

  //       await ctx.reply("Checking balance...");

  //       // Get balance from Base Sepolia
  //       const balance = await this.provider.getBalance(community.publicKey);
  //       const balanceInEth = ethers.formatEther(balance);

  //       // Update balance in database
  //       community.balance = parseFloat(balanceInEth);
  //       await community.save();

  //       // Format the message
  //       const balanceMessage = `
  // 💰 *Community Wallet Balance*

  // 🏠 *Community:* ${community.communityName}
  // 🔗 *Trust Pool:* ${community.trustPoolName}
  // 💼 *Address:* \`${community.publicKey}\`
  // 💵 *Balance:* ${balanceInEth} ETH

  // 🔍 [View on Explorer](https://sepolia.basescan.org/address/${community.publicKey})
  // `;

  //       await ctx.reply(balanceMessage, { parse_mode: "Markdown" });
  //       logger.info(`Balance checked for community ${community.communityName}`);
  //     } catch (error) {
  //       logger.error("Error in handleBalance:", error);
  //       await ctx.reply("Failed to fetch balance. Please try again.");
  //     }
  //   }

  // * EXPORT WALLET COMMAND
  // * Exports the wallet for the community
  //   private async handleExportWallet(ctx: Context) {
  //     try {
  //       // Verify it's a private message to protect sensitive data
  //       if (ctx.chat?.type !== "private") {
  //         await ctx.reply(
  //           "⚠️ For security reasons, wallet export is only available in private chat. Please message me directly."
  //         );
  //         return;
  //       }

  //       const userId = ctx.from?.id;
  //       if (!userId) {
  //         await ctx.reply("Error: Could not identify user.");
  //         return;
  //       }

  //       const communities = await CultureBotCommunity.find({ initiator: ctx.from?.username });

  //       if (communities.length === 0) {
  //         await ctx.reply("You haven't initiated any communities.");
  //         return;
  //       }

  //       for (const community of communities) {
  //         if (!community.privateKey || !community.publicKey) {
  //           continue;
  //         }

  //         try {
  //           // Decrypt the private key
  //           const decryptedPrivateKey = CryptoUtils.decrypt(community.privateKey);

  //           const walletInfo = `
  // 🔐 *Wallet Export for ${community.communityName}*

  // 🔗 *Trust Pool:* ${community.trustPoolName}
  // 💼 *Public Address:* \`${community.publicKey}\`
  // 🔑 *Private Key:* \`${decryptedPrivateKey}\`

  // ⚠️ *IMPORTANT:*
  // - Keep this private key secure
  // - Never share it with anyone
  // - Store it safely offline
  // - Delete this message after saving the key

  // 🔍 [View on Explorer](https://sepolia.basescan.org/address/${community.publicKey})
  // `;

  //           await ctx.reply(walletInfo, {parse_mode: "Markdown"});

  //           await ctx.reply("⚠️ Please delete the above message after saving the private key securely.");
  //         } catch (error) {
  //           logger.error(`Error exporting wallet for community ${community.communityName}:`, error);
  //           await ctx.reply(`Failed to export wallet for community ${community.communityName}`);
  //         }
  //       }

  //       logger.info(`Wallets exported for user ${ctx.from?.username}`);
  //     } catch (error) {
  //       logger.error("Error in handleExportWallet:", error);
  //       await ctx.reply("Failed to export wallet(s). Please try again.");
  //     }
  //   }

  // * START WATCHING COMMAND
  // * Starts watching a community.
  // private async handleStartWatching(ctx: Context) {
  //   try {
  //     const chatId = ctx.chat?.id;
  //     if (!chatId) {
  //       await ctx.reply("Error: Could not determine chat ID.");
  //       return;
  //     }

  //     const community = await CultureBotCommunity.findOne({ chatId });

  //     if (!community) {
  //       await ctx.reply(
  //         "Error: Community not found. Please connect to a trust pool first using /trustpool <link>."
  //       );
  //       return;
  //     }

  //     community.isWatching = true;
  //     await community.save();
  //     await ctx.reply("Started watching community.");
  //     logger.info(`Started watching community ${community.communityName}.`);
  //   } catch (error) {
  //     logger.error("Error handling /watch command:", error);
  //     await ctx.reply("Failed to start watching community. Please try again.");
  //   }
  // }

  // * STOP WATCHING COMMAND
  // * Stops watching a community.
  // private async handleStopWatching(ctx: Context) {
  //   try {
  //     const chatId = ctx.chat?.id;
  //     if (!chatId) {
  //       await ctx.reply("Error: Could not determine chat ID.");
  //       return;
  //     }

  //     const community = await CultureBotCommunity.findOne({ chatId });

  //     if (!community) {
  //       await ctx.reply(
  //         "Error: Community not found. Please connect to a trust pool first using /trustpool <pool_id> <pool_name>."
  //       );
  //       return;
  //     }

  //     if (community.isWatching === false) {
  //       await ctx.reply("Error: Community is not being watched.");
  //       return;
  //     }

  //     community.isWatching = false;
  //     await community.save();
  //     await ctx.reply("Stopped watching community.");
  //     logger.info(`Stopped watching community ${chatId}.`);
  //   } catch (error) {
  //     logger.error("Error handling /stopwatch command:", error);
  //     await ctx.reply("Failed to stop watching community. Please try again.");
  //   }
  // }

  // @ts-ignore
  private async storeMessageOnIpfs(message: string): Promise<IPFSResponse | undefined> {
    try {
      const pinata = new PinataSDK({
        pinataJwt: config.pinataJwt,
        pinataGateway: config.pinataGateway,
      });

      const file = new File([message], "message.txt", { type: "text/plain" });
      const upload = await pinata.upload.file(file);
      logger.info("Uploaded message to IPFS (console logged by normal command!):");
      console.log(upload);
      return upload;
    } catch (error) {
      logger.error("Error storing message on IPFS:", error);
      return;
    }
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
    return receipt.hash;
  }

  // * HANDLE MESSAGE
  // * Handles incoming messages from the community.
  private async handleMessage(ctx: Context) {
    // if message starts with "/", it is a command
    if (ctx.message?.text?.startsWith("/")) {
      return;
    }
    
    try {
      const chatId = ctx.chat?.id;
      const text = ctx.message?.text;
      const senderUsername = ctx.from?.username || "unknown";
      const senderTgId = ctx.from?.id;

      if (!chatId || !text || !senderUsername || !senderTgId) {
        return;
      }
      
      const community = await CultureBotCommunity.findOne({ chatId });
      if (!community) {
        return;
      }

      if (community.isWatching === true) {
        // Store the message in the database
        const message = await CultureBotMessage.create({
          text,
          senderUsername,
          senderTgId: senderTgId.toString(),
          community: community._id,
        });

        // TODO: Fix this frigging error
        // @ts-ignore
        community.messages.push(message._id);

        await community.save();

        const mentionsBot = ctx.message?.entities?.some(
          (entity) =>
            entity.type === "mention" &&
            ctx.message?.text?.slice(entity.offset, entity.offset + entity.length) === "@culturepadbot"
        );

        if (mentionsBot) {
          // Upload to culture book and store onchain
          const processingMsg = await ctx.reply("📝 Processing message...");

          try {
            // storing message on culturebook
            const stored = await CultureBook.findOneAndUpdate(
              { trustPool: community.trustPool },
              {
                $push: {
                  value_aligned_posts: {
                    id: message._id,
                    posterUsername: message.senderUsername,
                    content: message.text,
                    timestamp: new Date(),
                    title: "From Telegram Community",
                    source: "Telegram",
                    onchain: true,
                    eligibleForVoting: false,
                  },
                },
              },
              { new: true }
            );
            
            if (!stored) {
              await ctx.reply("❌ Storage failed. Please try again.");
              return;
            }
            
            // Upload the message to pinata ipfs
            const response = await this.storeMessageOnIpfs(text);

            if (!response) {
              await ctx.reply("Error storing message on IPFS. Please try again.");
              return;
            }

            const txHash = await this.storeMessageOnChain(response.IpfsHash);

            message.transactionHash = txHash;
            message.ipfsHash = response.IpfsHash;
            await message.save();

            await ctx.api.editMessageText(
              chatId,
              processingMsg.message_id,
              `✅ Message stored!\n\nChain: https://sepolia.basescan.org/tx/${txHash}\nIPFS: https://gateway.pinata.cloud/ipfs/${response.IpfsHash}\n✅ Message stored in Culture Book.`
            );
          } catch (error) {
            logger.error("Storage failed:", error);
            await ctx.reply("❌ Storage failed. Please try again. Make sure the wallet is funded.");
          }
        }

        logger.info(`Stored message from ${senderUsername} in community ${community.communityName}.`);
      }
    } catch (error) {
      logger.error("Error handling message:", error);
    }
  }

  // * GET MESSAGE COMMAND
  // * Fetches the message given the transaction hash
  // private async handleGetMessage(ctx: Context) {
  //   const chatId = ctx.chat?.id;
  //   if (!chatId) {
  //     await ctx.reply("Error: Could not determine chat ID.");
  //     return;
  //   }

  //   const args = ctx.message?.text?.split(" ").slice(1);

  //   if (!args || args.length < 1) {
  //     await ctx.reply("Error: Please use format: /trustpool <link>");
  //     return;
  //   }

  //   const [txHash] = args;

  //   // Fetch the message from base sepolia using transaction hash
  //   const tx = await this.provider.getTransaction(txHash);
  //   if (!tx) {
  //     await ctx.reply("Error: Transaction not found.");
  //     return;
  //   }

  //   const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  //   const decodedData = abiCoder.decode(["string"], tx.data);
  //   const ipfsHash = decodedData[0];

  //   // Fetch the message from IPFS using IPFS hash
  //   const pinata = new PinataSDK({
  //     pinataJwt: config.pinataJwt,
  //     pinataGateway: config.pinataGateway,
  //   });

  //   const data = await pinata.gateways.get(ipfsHash);
  //   if (!data) {
  //     await ctx.reply("Error: IPFS data not found.");
  //     return;
  //   }

  //   const messageText = data.data?.toString();
  //   await ctx.reply(`📜 Message 📜\n\n${messageText}`);

  //   logger.info(`Fetched message from IPFS for community ${chatId}.`);

  //   if (!txHash || !ipfsHash) {
  //     await ctx.reply("Error: Please use format: /getmessage <txHash> <ipfsHash>");
  //     return;
  //   }
  // }

  // * DETAILS COMMAND
  // * Shows details of the community.
  //   private async handleDetails(ctx: Context) {
  //     try {
  //       const chatId = ctx.chat?.id;
  //       if (!chatId) {
  //         await ctx.reply("Error: Could not determine chat ID.");
  //         return;
  //       }

  //       const community = await CultureBotCommunity.findOne({ chatId });

  //       if (!community) {
  //         await ctx.reply("Community not found.");
  //         return;
  //       }

  //       const communityDetailsMessage = `
  // 🌐 *Community Details* 📋

  // 🔹 *Trust Pool Link:* https://app.valuesdao.io/trustpools/${community.trustPoolId}
  // 🔹 *Trust Pool Name:* ${community.trustPoolName}
  // 🔹 *Community Name:* ${community.communityName}
  // 🔹 *Initiator:* ${community.initiator}
  // 🔹 *Watching Messages:* ${community.isWatching ? "✅ Enabled" : "❌ Disabled"}
  // 🔹 *Public Key:* \`${community.publicKey || "Not set"}\`

  // 💡 Use /watch to start capturing messages or /stopwatch to stop.
  // `;

  //       await ctx.reply(communityDetailsMessage, { parse_mode: "Markdown" });
  //     } catch (error) {
  //       logger.error("Error handling /details command:", error);
  //       await ctx.reply("Failed to fetch community details. Please try again.");
  //     }
  //   }

  async start() {
    try {
      await this.bot.start();
      logger.info("Telegram bot started.");
    } catch (error) {
      logger.error("Error starting Telegram bot:", error);
    }
  }
}