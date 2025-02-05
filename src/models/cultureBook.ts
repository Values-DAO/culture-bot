import { model, models, Schema, type Document } from "mongoose";
import type { ICultureBotCommunity } from "./community";
import type { ICultureToken } from "./cultureToken";

export interface ICultureBook extends Document {
  _id: string;
  trustPool?: Schema.Types.ObjectId;
  cultureBotCommunity?: Schema.Types.ObjectId | ICultureBotCommunity;
  cultureToken?: Schema.Types.ObjectId | ICultureToken;
  core_values: Map<string, number>;
  spectrum: Array<{
    name: string;
    description: string;
    score: number;
  }>;
  value_aligned_posts: Array<{
    _id: string;
    posterUsername: string;
    posterTgId?: string;
    messageTgId?: string;
    content?: string;
    timestamp: Date;
    title: string;
    source: "Twitter" | "Youtube" | "Farcaster" | "Telegram";
    onchain: boolean;
    eligibleForVoting: boolean;
    votes: {
      count: number;
      alignedUsers: Array<{
        userTgId: string;
        userTgUsername: string;
      }>;
      notAlignedUsers: Array<{
        userTgId: string;
        userTgUsername: string;
      }>;
    };
    transactionHash?: string;
    ipfsHash?: string;
    hasPhoto: boolean;
    photoUrl?: string;
    photoFileId?: string;
    status: "pending" | "approved" | "rejected" | "processing";
    rewardStatus: "pending" | "rewarded" | "rejected" | "processing";
    engagementRewardStatus: boolean,
    votingEndsAt?: Date;
    tgPollId?: string;
    tgPollMessageId?: string;
  }>;
  updateDescription: {
    content: string;
    timestamp: Date;
  };
}

export type ValueAlignedPost = ICultureBook["value_aligned_posts"][number];

const cultureBookSchema = new Schema({
  // * Trust Pool
  trustPool: {
    type: Schema.Types.ObjectId,
    ref: "TrustPools",
  },
  // * Culture Bot Community
  cultureBotCommunity: {
    type: Schema.Types.ObjectId,
    ref: "CultureBotCommunity",
  },
  // * Culture Token
  cultureToken: {
    type: Schema.Types.ObjectId,
    ref: "CultureToken",
  },
  // * Content for the Culture Book
  core_values: {
    type: Map,
    of: Number,
    default: {},
  },
  spectrum: [
    {
      type: {
        name: { type: String, required: true },
        description: { type: String, required: true },
        score: { type: Number, required: true, min: 1, max: 100 },
      },
      default: [],
    },
  ],
  value_aligned_posts: [
    {
      type: {
        posterUsername: { type: String, required: true },
        posterTgId: { type: String },
        messageTgId: { type: String },
        content: { type: String },
        timestamp: { type: Date, required: true },
        title: { type: String, required: true },
        source: { type: String, enum: ["Twitter", "Youtube", "Farcaster", "Telegram"], required: true },
        onchain: { type: Boolean, default: false },
        eligibleForVoting: { type: Boolean, default: true },
        votes: {
          type: {
            count: { type: Number, default: 0 },
            alignedUsers: [
              {
                userTgId: { type: String, required: true },
                userTgUsername: { type: String, required: true },
              },
            ],
            notAlignedUsers: [
              {
                userTgId: { type: String, required: true },
                userTgUsername: { type: String, required: true },
              },
            ],
          },
          default: {
            count: 0,
            alignedUsers: [],
            notAlignedUsers: [],
          },
        },
        transactionHash: { type: String },
        ipfsHash: { type: String },
        hasPhoto: { type: Boolean, default: false },
        photoUrl: { type: String }, // IPFS Pinata URL
        photoFileId: { type: String }, // Telegram File ID to refetch the image when needed
        status: { type: String, enum: ["pending", "approved", "rejected", "processing"] }, // onchain status
        rewardStatus: { type: String, enum: ["pending", "rewarded", "rejected", "processing"], default: "processing" }, // reward status
        engagementRewardStatus: { type: Boolean, default: false }, // engagement reward status
        votingEndsAt: { type: Date },
        tgPollId: { type: String },
        tgPollMessageId: { type: String },
      },
      default: [],
    },
  ],
  // TODO: Remove this
  updateDescription: {
    type: {
      content: { type: String, required: true },
      timestamp: { type: Date, default: Date.now },
    },
  },
});

export const CultureBook = models.CultureBook || model<ICultureBook>("CultureBook", cultureBookSchema);