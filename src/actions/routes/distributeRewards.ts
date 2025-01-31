import { Router, type Request, type Response } from "express";
import { logger } from "../../utils/logger";
import { distributeRewards } from "../cron/distributeRewards";

export const distributeRewardsRouter = (): Router => {
  const router = Router();
  
  router.post("/", async (req: Request, res: Response) => {
    logger.info("[HTTP]: Received request at /api/distribute-rewards");
    
    try {
      const response = await distributeRewards();
      if (response) {
        res.status(200).json({ message: "Rewards distributed successfully" });
        logger.info("[HTTP]: Rewards distributed successfully");
      } else {
        throw new Error("Rewards distribution failed");
      }
    } catch (error) {
      logger.error(`[HTTP]: Error distributing rewards (POST /api/distribute-rewards): ${error}`);
      res.status(500).json({ error: "Internal server error" });
    }
  })
  
  return router;
}