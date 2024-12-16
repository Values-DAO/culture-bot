import { connectDB } from "./services/database";
import { HttpServer } from "./services/http";
import { TelegramService } from "./services/telegram";

async function main() {
  await connectDB();
  const telegramService = new TelegramService();
  const httpServer = new HttpServer(telegramService);
  
  await Promise.all([telegramService.start(), httpServer.start(Number(process.env.PORT) || 3000)]);

  console.log("All services started successfully");
}

main().catch(console.error);
