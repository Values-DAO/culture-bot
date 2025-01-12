import { connectDB } from "./services/database";
import { HttpServer } from "./services/http";
import { TelegramService } from "./services/telegram";
import { logger } from "./utils/logger";

async function main() {
  await connectDB();
  const telegramService = new TelegramService();
  const httpServer = new HttpServer(telegramService);
  
  await Promise.all([telegramService.start(), httpServer.start(Number(process.env.PORT) || 3000)]);

  logger.info("[SYSTEM]: Services started successfully");
}

main().catch((error) => logger.error(`[SYSTEM]: Error starting services: ${error}`));
