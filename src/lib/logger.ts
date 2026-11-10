import pino from "pino";

const redactPaths = [
  "OPENAI_API_KEY",
  "TEACHER_PASSWORD",
  "TEACHER_PASSWORD_HASH",
  "AUTH_SECRET",
  "password",
  "token",
  "*.password",
  "*.token",
  "req.headers.authorization",
  "req.headers.cookie",
];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),
  redact: { paths: redactPaths, censor: "[redacted]" },
  base: { service: "opencode-class" },
  timestamp: pino.stdTimeFunctions.isoTime,
});
