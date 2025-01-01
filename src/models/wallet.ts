import { model, models, Schema } from "mongoose";

const walletSchema = new Schema({
  telegramUsername: {
    type: String,
    required: true,
  },
  telegramId: {
    type: String,
    required: true,
  },
  privateKey: {
    type: String,
    required: true,
  },
  publicKey: {
    type: String,
    required: true,
  },
  
})

export const Wallet = models.Wallet || model("Wallet", walletSchema);