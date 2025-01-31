import { Network } from 'alchemy-sdk';
import dotenv from 'dotenv';
import { createConfig, http } from "wagmi";
import { baseSepolia } from "wagmi/chains";

dotenv.config();

export const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN!,
  mongoUri: process.env.MONGO_URI!,
  baseSepoliaRpc: process.env.BASE_RPC_URL!,
  privateKey: process.env.PRIVATE_KEY!,
  encryptionKey: process.env.ENCRYPTION_KEY!,
  IV_LENGTH: 16,
  pinataJwt: process.env.PINATA_JWT!,
  pinataGateway: process.env.PINATA_GATEWAY!,
  backendUrl:
    process.env.ENV === "prod"
      ? "https://api.valuesdao.io"
      : process.env.ENV === "staging"
      ? "https://staging-api.valuesdao.io"
      : "http://localhost:3000",
  alchemyKey: process.env.ALCHEMY_KEY!,
  alchemySettings: {
    apiKey: process.env.ALCHEMY_KEY!,
    network: process.env.ENV === "prod" ? Network.BASE_MAINNET : Network.BASE_SEPOLIA,
  },
};

export const bconfig = createConfig({
  chains: [baseSepolia],
  transports: {
    [baseSepolia.id]: http("https://base-sepolia.g.alchemy.com/v2/sCRkeELOK2UImXTjQsv3HsfyvaQ1qlIV"),
  },
});
