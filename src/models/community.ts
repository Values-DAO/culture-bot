import { Schema, model } from "mongoose";

export const cultureBotCommunitySchema = new Schema({
  trustPoolId: {
    type: String,
    required: true,
    unique: true,
  },
  trustPoolName: {
    type: String,
    required: true,
  },
  communityName: {
    type: String,
    required: true,
  },
  chatId: {
    type: String,
    required: true,
  },
  initiator: { // the user who entered the community in the telegram bot
    type: String,
    required: true,
  },
  initiatorTgId: {
    type: String,
    required: true
  },
  isWatching: {
    type: Boolean,
    default: false,
  },
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
  messages: [{
    type: Schema.Types.ObjectId,
    ref: "Message",
  }]
}, {timestamps: true})


export const CultureBotCommunity = model("CultureBotCommunity", cultureBotCommunitySchema);