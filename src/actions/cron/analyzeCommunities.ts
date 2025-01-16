import axios from "axios";
import type { ICultureBotCommunity } from "../../models/community"
import { logger } from "../../utils/logger";
import { getTrustPoolById } from "../database/queries";
import { config } from "../../config/config";
import type { ITrustPool } from "../../models/trustpool";
import type { ICultureBook, ValueAlignedPost } from "../../models/cultureBook";
import { CONTRIBUTORS_MESSAGE, NO_CONTRIBUTORS_MESSAGE } from "../../constants/messages";
import type mongoose from "mongoose";
import { getOrCreateWallets } from "../wallet/utils";

export const processCommunity = async (community: ICultureBotCommunity): Promise<string | undefined> => {
  try {
    if (community.messages.length === 0) {
      logger.info(`[BOT]: No total messages to process in community ${community.communityName}`);
      return;
    }
    
    const response = await generateCultureBook(community.trustPool);
    if (!response) return;
    
    let trustpool = await getTrustPoolById(community.trustPool);
    if (!trustpool) {
      logger.warn(`[BOT]: Trust pool not found for community ${community.communityName}`);
      return;
    }

    const posts = getPostsExtractedByAI(trustpool);
    if (!posts) return;
    
    const wallets = getOrCreateWallets(posts);
    // TODO: Distribute rewards

    const groupedPosts = groupPostsByUser(posts);
    const topContributors = getTopContributors(groupedPosts);

    const message = getTopContributorsMessage(topContributors, groupedPosts, community.communityName, trustpool._id);

    return message;
  } catch (error) {
    logger.warn(`[BOT]: Error processing community ${community.communityName}: ${error}`);
    return;
  }
}

export const getTopContributorsMessage = (topContributors: any, groupedPosts: any, communityName: string, trustPoolId: string): string => {
  if (topContributors.length === 0) {
    logger.info(`[BOT]: No contributors found for community ${communityName}`);
    return NO_CONTRIBUTORS_MESSAGE;
  } else {
    logger.info(`[BOT]: Found contributors for community ${communityName}: ${topContributors.join(", ")}`);
    const formattedMessage = getFormattedTopContributorsMessage(topContributors, groupedPosts);
    return CONTRIBUTORS_MESSAGE(trustPoolId, formattedMessage);
  }
}

export const getFormattedTopContributorsMessage = (topContributors: any, groupedPosts: any) => {
  return topContributors
    .map((username: string, index: number) => {
      const posts = groupedPosts[username];
      const numberedPosts = posts.map((post: string) => `   • ${post}`).join("\n\n");
      return `${index + 1}. @${username} (${posts.length} post(s)):\n\n${numberedPosts}`;
    })
    .join("\n\n");
}

export const getTopContributors = (groupedPosts: any) => {
  return Object.keys(groupedPosts);
}

export const groupPostsByUser = (posts: any) => {
  const groupedPosts =  posts.reduce((acc: any, post: any) => {
    if (!acc[post.posterUsername]) { // if the user is not in the accumulator
      acc[post.posterUsername] = new Set(); // create a new set
    }
    acc[post.posterUsername].add(post.content); // else, add the post to the user's set
    return acc; // build up the final object
  }, {}); // start with an empty object
  
  // convert the sets to arrays
  for (const username in groupedPosts) {
    groupedPosts[username] = Array.from(groupedPosts[username]);
  }
  
  return groupedPosts;
} 

export const getPostsExtractedByAI = (trustpool: ITrustPool): ValueAlignedPost[] | boolean => {
  try {
    const cultureBook = trustpool!.cultureBook as ICultureBook; // because it's populated
    
    const posts = cultureBook.value_aligned_posts
      .filter((post) => !post.votingEndsAt) // avoid posts from telegram polls
      .filter((post) => post.eligibleForVoting) // avoid posts that are not eligible for voting
      
    return posts;
  } catch (error) {
    logger.warn(`[BOT]: Error getting posts extracted by AI for trust pool ID: ${trustpool._id}: ${error}`);
    return false
  }
}

export const generateCultureBook = async (trustPoolId: mongoose.Schema.Types.ObjectId) => {
  try {
    const response = await axios.post(`${config.backendUrl}/cultureBook/generate`, {trustPoolId});
    if (response.status !== 200) {
      throw new Error(`Failed to generate culture book`);
    }
    return true;
  } catch (error) {
    logger.warn(`[BOT]: Error generating culture book for trust pool ID: ${trustPoolId}: ${error}`);
    return false
  }
}