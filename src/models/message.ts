import { Schema, model, models } from "mongoose";

const cultureBotMessageSchema = new Schema(
  {
    text: {
      type: String,
      required: true,
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
  },
  { timestamps: true }
);

export const CultureBotMessage = models.CultureBotMessage || model("CultureBotMessage", cultureBotMessageSchema);
