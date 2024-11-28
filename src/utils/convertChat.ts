import * as fs from "fs";

// Define the output message interface
interface ConvertedMessage {
  text: string;
  isTagged: boolean;
  senderUsername: string;
  senderTgId: string;
  community: string;
}

// Function to convert Telegram chat export
function convertTelegramExport(inputFile: string, outputFile: string): void {
  // Read the input JSON file
  const rawData = fs.readFileSync(inputFile, "utf-8");
  const chatData = JSON.parse(rawData);

  // Extract community name from the first line
  const communityName = chatData.name || "Unknown Community";

  // Convert messages
  const convertedMessages: ConvertedMessage[] = chatData.messages
    .filter((msg: any) => msg.type === "message")
    .map((msg: any) => {
      // Combine text elements if it's an array
      let fullText = "";
      if (Array.isArray(msg.text)) {
        fullText = msg.text
          .filter((item: any) => typeof item === "string" || (typeof item === "object" && item.type === "plain"))
          .map((item: any) => (typeof item === "string" ? item : item.text))
          .join(" ");
      } else if (typeof msg.text === "string") {
        fullText = msg.text;
      }

      return {
        text: fullText.trim(),
        isTagged: false,
        senderUsername: msg.from || "Unknown",
        senderTgId: msg.from_id || "Unknown",
        community: communityName,
      };
    });

  // Write converted messages to output file
  fs.writeFileSync(outputFile, JSON.stringify(convertedMessages, null, 2));

  console.log(`Converted ${convertedMessages.length} messages to ${outputFile}`);
}

// Usage example
try {
  convertTelegramExport("src/utils/result.json", "converted_messages.json");
} catch (error) {
  console.error("Conversion failed:", error);
}

// Export the function if needed in a module
export default convertTelegramExport;
