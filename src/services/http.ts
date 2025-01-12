// src/services/http.ts
import express from "express";
import { TelegramService } from "./telegram";
import { logger } from "../utils/logger";
import { healthRouter } from "../actions/routes/health";
import { pollDatabaseRouter } from "../actions/routes/pollDatabase";
import { processMessagesRouter } from "../actions/routes/processMessages";
import { apiKeyAuth } from "../actions/middlewares/apiKeyAuth";

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
    this.app.use(apiKeyAuth);
  }

  private setupRoutes() {
    this.app.use("/api/process-messages", processMessagesRouter(this.telegramService)); // Process messages endpoint
    this.app.use("/api/poll-database", pollDatabaseRouter(this.telegramService)); // Poll database endpoint
    this.app.use("/health", healthRouter()); // Health check endpoint
    // TODO: Add rewards endpoint
  }

  public start(port: number = 3000) {
    return new Promise((resolve) => {
      this.app.listen(port, () => {
        logger.info(`[SYSTEM]: HTTP server listening on port ${port}`);
        resolve(true);
      });
    });
  }
}
