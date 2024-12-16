import dotenv from 'dotenv';

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
  backendUrl: process.env.ENV === 'prod' ? "https://api.valuesdao.io": process.env.ENV === 'staging' ? 'https://staging-api.valuesdao.io' : 'http://localhost:3000',
};