import { model, models, Schema, type Document } from "mongoose";
import type { ICultureBook } from "./cultureBook";

export interface ITrustPool extends Document {
  _id: string;
  name: string;
  description?: string;
  logo?: string;
  communityLink?: string;
  twitterHandle?: string;
  farcasterHandle?: string;
  organizerTwitterHandle?: string;
  owners: Schema.Types.ObjectId[];
  members: Schema.Types.ObjectId[];
  ipfsHash: string;
  communityId: string;
  cultureBotCommunity?: Schema.Types.ObjectId;
  cultureBook?: Schema.Types.ObjectId | ICultureBook;
  cultureToken?: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const trustPoolSchema = new Schema({
  // * General Info
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
  },
  logo: {
    type: String,
  },
  communityLink: {
    type: String,
  },
  twitterHandle: {
    type: String,
  },
  farcasterHandle: {
    type: String,
  },
  organizerTwitterHandle: {
    type: String,
  },
  owners: {
    type: [
      {
        type: Schema.Types.ObjectId,
        ref: "Users",
      },
    ],
    required: true,
  },
  members: {
    type: [
      {
        type: Schema.Types.ObjectId,
        ref: "Users",
      },
    ],
    default: [],
  },
  // * Culture Book
  cultureBook: {
    type: Schema.Types.ObjectId,
    ref: "CultureBook",
  },
  // * Community
  cultureBotCommunity: {
    type: Schema.Types.ObjectId,
    ref: "CultureBotCommunity",
  },
  // * Culture Token
  cultureToken: {
    type: Schema.Types.ObjectId,
    ref: "CultureToken",
  }
  // createdAt: {
  //   type: Date,
  //   default: Date.now,
  //   index: true,
  // },
}, { timestamps: true }); // remove this and uncomment the above code if error occurs

export const TrustPools = models.TrustPools || model<ITrustPool>("TrustPools", trustPoolSchema);
