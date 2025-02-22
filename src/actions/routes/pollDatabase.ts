import { Router, type Request, type Response } from "express"
import type { TelegramService } from "../../services/telegram";
import { logger } from "../../utils/logger";

export const pollDatabaseRouter = (telegramService: TelegramService): Router => {
  const router = Router();
  
  router.post("/", async (req: Request, res: Response) => {
    logger.info("[HTTP]: Received request at /api/poll-database");
    
    try {
      const response = await telegramService.checkForDuePosts();
      if (response) { // response is true or false
        res.status(200).json({ message: "Database polled successfully" });
        logger.info("[HTTP]: Database polled successfully");
      } else {
        throw new Error("Database polling failed");
      }
    } catch (error) {
      logger.error(`[HTTP]: Error polling database (POST /api/poll-database): ${error}`);
      res.status(500).json({ error: "Internal server error" });
    }
  })
  
  return router;
}