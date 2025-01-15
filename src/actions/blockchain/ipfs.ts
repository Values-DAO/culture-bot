import { PinataSDK } from "pinata-web3";
import { logger } from "../../utils/logger";
import { config } from "../../config/config";
import { downloadImage } from "../telegram/utils";
import type { IPFSResponse } from "../../types/types";

export const storeMessageOnIpfs = async (content: { text: string; photo: any }): Promise<IPFSResponse> => {
  try {
    const pinata = createNewPinataInstance();
    const isOnlyText = content.text && !content.photo;
    
    if (isOnlyText) {
      return await uploadOnlyTextToIPFS(content, pinata);
    } else {
      return await uploadTextAndImageToIPFS(content, pinata);
    }
  } catch (error) {
    logger.error(`[BOT]: Error storing post on IPFS: ${error}`);
    throw new Error("Failed to store message on IPFS");
  }
}

export const uploadTextAndImageToIPFS = async (content: any, pinata: any) => {
  try {
    const imageBuffer = await downloadImage(content.photo.url);
    logger.info("[BOT]: Uploading photo and text message to IPFS...");
    const imageFile = new File([imageBuffer], "image.jpg", { type: "image/jpeg" });
    const imageUpload = await pinata.upload.file(imageFile);
    const finalContent = {
      text: content.text,
      image: {
        ipfsHash: imageUpload.IpfsHash,
        gateway_url: `https://violet-many-felidae-752.mypinata.cloud/ipfs/${imageUpload.IpfsHash}`,
      },
    };
    const metadataFile = new File([JSON.stringify(finalContent)], "message.json", { type: "application/json" });
    const metadataUpload = await pinata.upload.file(metadataFile);
    logger.info(`[BOT]: IPFS hash: ${metadataUpload.IpfsHash}`);
    metadataUpload.gateway_url = finalContent.image.gateway_url;
    return metadataUpload;
  } catch (error) {
    logger.warn(`[BOT]: Error uploading photo message to IPFS: ${error}`);
    throw new Error("Failed to upload photo message to IPFS");
  }
}

export const createNewPinataInstance = () => {
  return new PinataSDK({
    pinataJwt: config.pinataJwt,
    pinataGateway: config.pinataGateway,
  });
}

export const uploadOnlyTextToIPFS = async (content: any, pinata: any) => {
  try {
    logger.info(`[BOT]: Uploading text message to IPFS...`);
    const file = new File([content.text], "message.txt", { type: "text/plain" });
    const upload = await pinata.upload.file(file);
    logger.info(`[BOT]: IPFS hash: ${upload.IpfsHash}`);
    return upload;
  } catch (error) {
    logger.warn(`[BOT]: Error uploading text message to IPFS: ${error}`);
    throw new Error("Failed to upload text message to IPFS");
  }
}