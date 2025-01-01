import { model, models, Schema } from "mongoose";

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
        content: { type: String },
        timestamp: { type: Date, required: true },
        title: { type: String, required: true },
        source: { type: String, enum: ["Twitter", "Youtube", "Farcaster", "Telegram"], required: true },
        onchain: { type: Boolean, default: false },
        eligibleForVoting: { type: Boolean, default: true },
        votes: {
          type: {
            count: { type: Number },
            alignedUsers: [
              {
                type: {
                  userId: { type: String, required: true },
                },
              },
            ],
            notAlignedUsers: [
              {
                type: {
                  userId: { type: String, required: true },
                },
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
        status: { type: String, enum: ["pending", "approved", "rejected", "processing"]},
        votingEndsAt: { type: Date },
        pollId: { type: String },
      },
      default: [],
    },
  ],
  updateDescription: {
    type: {
      content: { type: String, required: true },
      timestamp: { type: Date, default: Date.now },
    },
  },
});

export const CultureBook = models.CultureBook || model("CultureBook", cultureBookSchema);