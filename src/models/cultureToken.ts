import { model, models, Schema, type Document } from "mongoose";
import type { ITrustPool } from "./trustpool";
import type { ICultureBook } from "./cultureBook";

export interface ICultureToken extends Document{
  _id: string;
  trustPool?: Schema.Types.ObjectId | ITrustPool;
  cultureBook?: Schema.Types.ObjectId | ICultureBook;
  name: string;
  symbol: string;
  allocationAddress: {
    curatorTreasuryAllocation: string;
    treasuryAllocation: string;
    adminTreasuryAllocation: string;
  }[];
  allocationAmount: {
    curatorTreasuryAllocation: number;
    treasuryAllocation: number;
    adminTreasuryAllocation: number;
  }[];
  maximumSupply: number;
  tokenAddress: string;
  bondingCurveAddress: string;
  description?: string;
  prices: {
    price: number;
    timestamp: Date;
  }[];
  marketCaps: {
    marketCap: number;
    timestamp: Date;
  }[];
  chartPrices: {
    price: number;
    timestamp: Date;
  }[];
  chartMarketCaps: {
    marketCap: number;
    timestamp: Date;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const cultureTokenSchema = new Schema(
  {
    // * Trust Pool
    trustPool: {
      type: Schema.Types.ObjectId,
      ref: "TrustPools",
    },
    // * Culture Book
    cultureBook: {
      type: Schema.Types.ObjectId,
      ref: "CultureBook",
    },
    // * Token Fields
    name: {
      // from user
      type: String,
      required: true,
    },
    symbol: {
      // from user
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    tokenAddress: {
      type: String,
      required: true,
    },
    bondingCurveAddress: {
      type: String,
      required: true,
    },
    allocationAddress: {
      type: [
        {
          curatorTreasuryAllocation: { type: String, required: true }, // from user
          treasuryAllocation: {
            type: String,
            required: true,
            default: "0x78db1057A9A1102C3E831E5086B75E9a58e7730c",
          },
          adminTreasuryAllocation: {
            type: String,
            required: true,
            default: "0x78db1057A9A1102C3E831E5086B75E9a58e7730c",
          },
        },
      ],
    },
    allocationAmount: {
      type: [
        {
          curatorTreasuryAllocation: { type: Number, required: true, default: 5000000000 }, // 5 billion
          treasuryAllocation: { type: Number, required: true, default: 4000000000 }, // 4 billion
          adminTreasuryAllocation: { type: Number, required: true, default: 1000000000 }, // 1 billion
        },
      ],
    },
    maximumSupply: {
      type: Number,
      required: true,
      default: 100000000000000000000000000000, // 100 billion
    },
    prices: {
      type: [
        {
          price: { type: Number, required: true },
          timestamp: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    marketCaps: {
      type: [
        {
          marketCap: { type: Number, required: true },
          timestamp: { type: Date, default: Date.now },
        },
      ],
    },
    chartPrices: {
      type: [
        {
          price: { type: Number, required: true },
          timestamp: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    chartMarketCaps: {
      type: [
        {
          marketCap: { type: Number, required: true },
          timestamp: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

export const CultureToken = models.CultureToken || model("CultureToken", cultureTokenSchema);