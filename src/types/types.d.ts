import type { ITrustPool } from "../models/trustpool";

export interface IPFSResponse {
  IpfsHash: string;
  PinSize: number;
  Timestamp: string;
  gateway_url?: string;
}

export interface createCultureBotCommunityProps {
  trustPool: ITrustPool;
  username: string;
  userId: string;
  chatId: string;
  communityName: string;
}