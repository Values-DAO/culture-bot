import { Router, type Request, type Response } from "express"
import type { TelegramService } from "../../services/telegram";
import { logger } from "../../utils/logger";

export const processMessagesRouter = (telegramService: TelegramService): Router => {
  const router = Router();
  
  router.post("/", async (req: Request, res: Response) => {
    logger.info("[HTTP]: Received request at /api/process-messages");
    
    try {
      const response = await telegramService.analyzeCommunitiesWithAI();
      if (response) { // response is true or false
        res.status(200).json({ message: "Messages processed successfully" });
        logger.info("[HTTP]: Completed community processing successfully");
      } else {
        throw new Error("Failed to process messages");
      }
    } catch (error) {
      logger.error(`[HTTP]: Error processing community (POST /api/process-messages): ${error}`);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  return router;
}