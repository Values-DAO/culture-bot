import { Schema, model, type Document, models } from "mongoose";

// TODO: Replace all these extra interfaces with ICultureBotCommunity
// Define the Message interface
interface Message extends Document {
  text: string;
  senderUsername: string;
  createdAt: Date;
  senderTgId: string;
  transactionHash?: string;
  ipfsHash?: string;
  community: string;
}

// Base Community interface (without populated fields)
interface CommunityBase {
  trustPool: Schema.Types.ObjectId;
  trustPoolName: string;
  communityName: string;
  chatId: string;
  initiator: string;
  initiatorTgId: string;
  isWatching: boolean;
  privateKey?: string;
  publicKey?: string;
  balance: number;
  messages: Schema.Types.ObjectId[] | Message[];
  cultureBook: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// Interface for the Community document (without populated fields)
interface Community extends CommunityBase, Document {}

// Interface for populated Community document
interface PopulatedCommunity extends Omit<Community, "messages"> {
  messages: Message[];
}

export interface ICultureBotCommunity extends Document {
  trustPool: Schema.Types.ObjectId;
  trustPoolName: string;
  communityName: string;
  chatId: string;
  initiator: string;
  initiatorTgId: string;
  isWatching: boolean;
  privateKey?: string;
  publicKey?: string;
  balance: number;
  messages: Schema.Types.ObjectId[] | Message[];
  cultureBook?: Schema.Types.ObjectId;
}

// Define the schema for the Community
const cultureBotCommunitySchema = new Schema<ICultureBotCommunity>(
  {
    // * Trust Pool
    trustPoolName: {
      type: String,
      required: true,
    },
    trustPool: {
      type: Schema.Types.ObjectId,
      ref: "TrustPools",
      required: true,
    },
    // * Culture Book
    cultureBook: {
      type: Schema.Types.ObjectId,
      ref: "CultureBook",
    },
    // * General Info
    communityName: {
      // name of the telegram group
      type: String,
      required: true,
    },
    chatId: {
      type: String,
      required: true,
    },
    initiator: {
      // the user who entered the community in the telegram bot
      type: String,
      required: true,
    },
    initiatorTgId: {
      type: String,
      required: true,
    },
    isWatching: {
      type: Boolean,
      default: true,
    },
    // TODO: Remove these fields
    privateKey: {
      type: String,
    },
    publicKey: {
      type: String,
    },
    balance: {
      type: Number,
      default: 0,
    },
    messages: {
      type: [
        {
          type: Schema.Types.ObjectId,
          ref: "CultureBotMessage",
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

export const CultureBotCommunity =
  models.CultureBotCommunity || model<ICultureBotCommunity>("CultureBotCommunity", cultureBotCommunitySchema);

export type { Community, PopulatedCommunity, Message };
