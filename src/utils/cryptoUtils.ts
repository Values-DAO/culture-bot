import crypto from "crypto";
import { config } from "../config/config";
import { logger } from "./logger";


export class CryptoUtils {
  private static validateKey() {
    if (!config.encryptionKey) {
      throw new Error("Encryption key is not set in environment variables");
    }
    if (config.encryptionKey.length !== 32) {
      throw new Error("Encryption key must be exactly 32 characters (256 bits)");
    }
  }

  /**
   * Encrypts a string using AES-256-CBC encryption
   * @param text The text to encrypt (e.g., private key)
   * @returns The encrypted text as a base64 string with IV prepended
   */
  static encrypt(text: string): string {
    try {
      this.validateKey();

      const iv = crypto.randomBytes(config.IV_LENGTH);
      const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(config.encryptionKey), iv);
      let encrypted = cipher.update(text, "utf8", "base64");
      encrypted += cipher.final("base64");
      // Prepend IV to encrypted text for later decryption
      const ivAndEncrypted = iv.toString("base64") + ":" + encrypted;

      return ivAndEncrypted;
    } catch (error) {
      logger.error("Encryption error:", error);
      throw new Error("Failed to encrypt data");
    }
  }

  /**
   * Decrypts a string that was encrypted using encrypt()
   * @param encryptedText The encrypted text (IV:EncryptedData format)
   * @returns The decrypted text
   */
  static decrypt(encryptedText: string): string {
    try {
      this.validateKey();

      // Split IV and encrypted text
      const [ivString, encrypted] = encryptedText.split(":");
      if (!ivString || !encrypted) {
        throw new Error("Invalid encrypted text format");
      }

      const iv = Buffer.from(ivString, "base64");
      const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(config.encryptionKey), iv);
      let decrypted = decipher.update(encrypted, "base64", "utf8");
      decrypted += decipher.final("utf8");

      return decrypted;
    } catch (error) {
      logger.error("Decryption error:", error);
      throw new Error("Failed to decrypt data");
    }
  }
}