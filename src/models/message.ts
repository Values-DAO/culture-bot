import { Schema, model, models, type Document } from "mongoose";

export interface ICultureBotMessage extends Document {
  _id: string;
  text?: string;
  senderUsername: string;
  senderTgId?: string;
  messageTgId?: string;
  transactionHash?: string;
  ipfsHash?: string;
  community: Schema.Types.ObjectId;
  hasPhoto: boolean;
  photoUrl?: string;
  photoFileId?: string;
  createdAt: Date;
  updatedAt: Date;
}

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
    messageTgId: {
      type: String,
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
    photoUrl: { // IPFS Pinata URL
      type: String,
    }, 
    photoFileId: { // Telegram File ID to refetch the image when needed
      type: String,
    }, 
    
  },
  { timestamps: true }
);

export const CultureBotMessage = models.CultureBotMessage || model<ICultureBotMessage>("CultureBotMessage", cultureBotMessageSchema);
