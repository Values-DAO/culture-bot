import { Router, type Request, type Response } from "express"
import { logger } from "../../utils/logger";

export const healthRouter = (): Router => {
  const router = Router();
  
  router.get("/", (req: Request, res: Response) => {
    logger.info("Received request at /health");
    logger.info("Health check passed");
    res.status(200).json({ status: "ok" });
  })
  
  return router;
}