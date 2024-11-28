import {Schema, model} from 'mongoose';

const cultureBotMessageSchema = new Schema({
  text: {
    type: String,
    required: true
  },
  isTagged: {
    type: Boolean,
    default: false
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
    ref: "Community",
    required: true,
  }
}, {timestamps: true});

export const CultureBotMessage = model("CultureBotMessage", cultureBotMessageSchema);