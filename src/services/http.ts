// src/services/http.ts
import express from "express";
import { TelegramService } from "./telegram";
import { logger } from "../utils/logger";

export class HttpServer {
  private app: express.Application;
  private telegramService: TelegramService;

  constructor(telegramService: TelegramService) {
    this.app = express();
    this.telegramService = telegramService;
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use(express.json());
    // Basic API key authentication middleware
    // @ts-ignore
    this.app.use((req, res, next) => {
      const apiKey = req.headers["x-api-key"];
      if (apiKey !== process.env.CRON_API_KEY) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      next();
    });
  }

  private setupRoutes() {
    this.app.post("/api/process-messages", async (req, res) => {
      logger.info("Received request at /api/process-messages");
      try {
        // Call main backend from here to generate/update values
        const response = await this.telegramService.cronJobResponder();
        if (response) {
          res.status(200).json({ message: "Messages processed successfully" });
        } else {
          throw new Error("cronJobResponder failed");
        }
      } catch (error) {
        console.error("Error processing messages:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });
    
    this.app.post("/api/poll-database", async (req, res) => {
      logger.info("Received request at /api/poll-database");
      
      try {
        const response = await this.telegramService.pollDatabase();
        if (response) {
          logger.info("Database polled successfully");
          res.status(200).json({ message: "Database polled successfully" });
        } else {
          throw new Error("pollDatabase failed");
        }
      } catch (error) {
        logger.info(`Error polling database: ${error}`);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Health check endpoint
    this.app.get("/health", (req, res) => {
      res.json({ status: "ok" });
    });
  }

  public start(port: number = 3000) {
    return new Promise((resolve) => {
      this.app.listen(port, () => {
        console.log(`HTTP server listening on port ${port}`);
        resolve(true);
      });
    });
  }
}
