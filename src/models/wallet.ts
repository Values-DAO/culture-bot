import { model, models, Schema, type Document } from "mongoose";

export interface IWallet extends Document {
  telegramUsername: string;
  telegramId: string;
  privateKey: string;
  publicKey: string;
}

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