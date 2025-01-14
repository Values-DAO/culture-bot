import { Alchemy } from "alchemy-sdk";
import { ethers } from "ethers";
import { config } from "../../config/config";
import { logger } from "../../utils/logger";

export const getETHTokensBalance = async (provider: any, publicKey: string): Promise<{balanceInEth: string, tokensMessage: string}> => {
  try {
    // Fetch ETH balance
    const balance = await provider.getBalance(publicKey);
    if (balance === null || balance === undefined) {
      throw new Error(`ETH balance not found for publicKey: ${publicKey}`);
    }

    const balanceInEth = ethers.formatEther(balance);

    // Fetch ERC-20 token balances
    const tokensMessage = await getERC20TokensBalance(publicKey);

    return { balanceInEth, tokensMessage };
  } catch (error) {
    logger.error(`[BOT]: Error in getETHTokensBalance for ${publicKey}: ${error}`);
    throw new Error("Failed to retrieve ETH and token balances.");
  }
}

export const getERC20TokensBalance = async (publicKey: string): Promise<string> => {
  try {
    const alchemy = new Alchemy(config.alchemySettings);
    const tokenBalancesResponse = await alchemy.core.getTokenBalances(publicKey);

    if (!tokenBalancesResponse) {
      throw new Error(`Failed to fetch token balances for ${publicKey}`);
    }

    const tokensMessage = await formatAlchemyTokensResponse(tokenBalancesResponse, alchemy);
    return tokensMessage;
  } catch (error) {
    logger.error(`[BOT]: Error in getERC20TokensBalance for ${publicKey}: ${error}`);
    throw new Error("Failed to retrieve ERC-20 token balances.");
  }
}

export const formatAlchemyTokensResponse = async (tokenBalancesResponse: any, alchemy: any): Promise<string> => {
  try {
    // Prepare a concise response for token balances
    let tokensMessage = "";

    if (tokenBalancesResponse.tokenBalances.length > 0) {
      for (const token of tokenBalancesResponse.tokenBalances) {
        const { contractAddress, tokenBalance } = token;

        // Skip if token balance is null or undefined
        if (!tokenBalance) continue;

        try {
          // Fetch token metadata
          const metadata = await alchemy.core.getTokenMetadata(contractAddress);
          const balance = BigInt(tokenBalance);
          const readableBalance =
            metadata.decimals && metadata.decimals > 0
              ? ethers.formatUnits(balance, metadata.decimals)
              : balance.toString();

          if (readableBalance !== "0" && readableBalance !== "0.0") {
            tokensMessage += `• ${metadata.name || "Unknown Token"} (${
              metadata.symbol || "N/A"
            }): ${readableBalance}\n`;
          }
        } catch (metadataError) {
          logger.warn(`[BOT]: Error fetching metadata for ${contractAddress}: ${metadataError}`);
          continue; // Skip problematic token
        }
      }
    }

    return tokensMessage;
  } catch (error) {
    logger.error(`[BOT]: Error in formatAlchemyTokensResponse: ${error}`);
    throw new Error("Failed to format token balances.");
  }
}