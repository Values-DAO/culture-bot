import { connectDB } from "./services/database";
import { TelegramService } from "./services/telegram";

async function main() {
  await connectDB();
  const telegramService = new TelegramService();
  await telegramService.start();
}

main().catch(console.error);
