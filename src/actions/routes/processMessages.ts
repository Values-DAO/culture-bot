import { Router, type Request, type Response } from "express"
import type { TelegramService } from "../../services/telegram";
import { logger } from "../../utils/logger";

export const processMessagesRouter = (telegramService: TelegramService): Router => {
  const router = Router();
  
  router.post("/", async (req: Request, res: Response) => {
    logger.info("Received request at /api/process-messages");
    
    try {
      const response = await telegramService.cronJobResponder();
      if (response) { // response is true or false
        res.status(200).json({ message: "Messages processed successfully" });
        logger.info("Messages processed successfully");
      } else {
        throw new Error("Failed to process messages");
      }
    } catch (error) {
      logger.error(`Error processing messages (POST /api/process-messages): ${error}`);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  return router;
}