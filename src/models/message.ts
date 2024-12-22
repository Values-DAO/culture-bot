import { Schema, model, models } from "mongoose";

const cultureBotMessageSchema = new Schema(
  {
    text: {
      type: String,
    },
    senderUsername: {
      type: String,
      required: true,
    },
    senderTgId: {
      type: String,
      required: true,
    },
    transactionHash: {
      type: String,
    },
    ipfsHash: {
      type: String,
    },
    community: {
      type: Schema.Types.ObjectId,
      ref: "CultureBotCommunity",
      required: true,
    },
    hasPhoto: {
      type: Boolean,
      default: false,
    },
    photoUrl: String, // IPFS Pinata URL
    photoFileId: String, // Telegram File ID to refetch the image when needed
  },
  { timestamps: true }
);

export const CultureBotMessage = models.CultureBotMessage || model("CultureBotMessage", cultureBotMessageSchema);
