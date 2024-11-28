import winston from "winston";

export const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.colorize(), // Adds color to console logs
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), // Custom timestamp format
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(), // Logs to the console
    new winston.transports.File({ filename: "error.log", level: "error" }), // Logs only errors to file
    new winston.transports.File({ filename: "combined.log" }), // Logs all levels to file
  ],
});
