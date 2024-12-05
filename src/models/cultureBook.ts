import { model, models, Schema } from "mongoose";
import { CultureBotCommunity } from "./community";

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
        id: { type: String, required: true },
        posterUsername: { type: String, required: true },
        content: { type: String, required: true },
        timestamp: { type: Date, required: true },
        title: { type: String, required: true },
        source: { type: String, enum: ["Twitter", "Youtube", "Farcaster", "Telegram"], required: true },
      },
      default: [],
    },
  ],
  top_posters: [
    {
      type: {
        username: { type: String, required: true },
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