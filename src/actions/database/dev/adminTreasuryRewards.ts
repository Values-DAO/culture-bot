import { ethers } from "ethers";
import { config } from "../../../config/config";
import { logger } from "../../../utils/logger";
import { adminTreasuryRewardsAddress, adminTreasuryRewardsABI} from "../../../contracts/adminTreasuryRewardsABI";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { generateMerkleTreeAndProofs } from "../../blockchain/rewards";

async function adminTreasuryRewards() {
  const usersWallets = [
    {
      wallet: {
        telegramUsername: "test",
        telegramId: "1110562767",
        publicKey: "0xd5478eC2413b06881dC0E13D3aA9201cd23c6276",
      },
      frequency: 1,
    },
    {
      wallet: {
        telegramUsername: "test2",
        telegramId: "1110562767",
        publicKey: "0x069Cdf5947f5A45136A9672D6161216CBFdA59f3",
      },
      frequency: 1,
    },
  ];
  const totalFrequency = 2;
  const baseAmount = BigInt(10989010); // 0.24725274730 %  of 100B tokens
  const scaledAmount = baseAmount * BigInt(10 ** 18); // Scale by 18 decimals
  const amountUnit = scaledAmount / BigInt(totalFrequency);
  const { root, proofs } = await generateMerkleTreeAndProofs(usersWallets, amountUnit);
  const tokenAddress = "0x0576B7BEA197C40288B8Bd06E21767db24d551Bb";
  
  for (let i = 0; i < usersWallets.length; i++) {
    await distributeRewardsToUser(
      (BigInt(usersWallets[i].frequency) * amountUnit).toString(),
      root,
      proofs[i]["proof"],
      usersWallets[i].wallet.publicKey, // @ts-ignore
      tokenAddress,
    );
  }
}

const distributeRewardsToUser = async (amount: string, root: string, proof: any, toAddress: string, tokenAddress: string) => {
  try { 
    const provider = new ethers.JsonRpcProvider(config.baseSepoliaRpc);
    const wallet = new ethers.Wallet(process.env.NEXT_PUBLIC_ADMIN_AUTHORITY_PRIVATE_KEY!, provider);
    const contract = new ethers.Contract(adminTreasuryRewardsAddress, adminTreasuryRewardsABI, wallet);
    const tx = await contract.distributeRewards(toAddress, tokenAddress, proof, root, BigInt(amount), {
      gasLimit: 300000,
    });
    const receipt = await tx.wait();
    logger.info(`[BOT]: Distributed ${amount} tokens to ${toAddress}. Transaction Hash: ${receipt.hash}`);
  } catch (error) {
    logger.warn(`[BOT]: Error updating merkle root for ${adminTreasuryRewardsAddress}: ${error}`);
    throw new Error(`Failed to update merkle root for ${adminTreasuryRewardsAddress}`);
  }
}

adminTreasuryRewards();