import type { Request, Response, NextFunction, RequestHandler } from "express";
import { logger } from "../../utils/logger";

export const apiKeyAuth: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers["x-api-key"];

  if (apiKey === process.env.CRON_API_KEY) {
    next();
  } else {
    res.status(401).send("Unauthorized");
    logger.info("Unauthorized request received");
  }
};
