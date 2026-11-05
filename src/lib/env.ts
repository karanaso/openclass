import { z } from "zod";

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_BASE_URL: z.string().url().default("http://localhost:3000"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
    AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
    TEACHER_PASSWORD: z.string().min(1).optional(),
    TEACHER_PASSWORD_HASH: z.string().min(1).optional(),
    OPENAI_API_KEY: z.string().min(1).optional(),
    AI_PROVIDER: z.enum(["openai", "mock"]).default("openai"),
    TTS_PROVIDER: z.enum(["openai", "mock"]).default("openai"),
    OPENAI_TEXT_MODEL: z.string().default("gpt-4.1-mini"),
    OPENAI_TTS_MODEL: z.string().default("gpt-4o-mini-tts"),
    OPENAI_TTS_VOICE_EL: z.string().default("alloy"),
    OPENAI_TTS_VOICE_EN: z.string().default("alloy"),
    STORAGE_ROOT: z.string().default("./data"),
    DEFAULT_LOCALE: z.enum(["el", "en"]).default("el"),
    MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(25 * 1024 * 1024),
    MAX_PDF_PAGES: z.coerce.number().int().positive().default(80),
    MAX_VIDEO_SECONDS: z.coerce.number().int().positive().default(900),
    VIDEO_RENDER_TIMEOUT_MS: z.coerce.number().int().positive().default(600_000),
    LOGIN_MAX_FAILURES: z.coerce.number().int().positive().default(8),
    LOGIN_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),
    GENERATION_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
    DEFAULT_PASS_THRESHOLD: z.coerce.number().min(0).max(100).default(60),
    CARD_MIN: z.coerce.number().int().positive().default(8),
    CARD_MAX: z.coerce.number().int().positive().default(16),
    QUESTIONNAIRE_MIN: z.coerce.number().int().positive().default(10),
    QUESTIONNAIRE_MAX: z.coerce.number().int().positive().default(20),
    GAME_MIN: z.coerce.number().int().positive().default(10),
    GAME_MAX: z.coerce.number().int().positive().default(15),
  })
  .superRefine((value, ctx) => {
    if (!value.TEACHER_PASSWORD && !value.TEACHER_PASSWORD_HASH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["TEACHER_PASSWORD"],
        message: "TEACHER_PASSWORD or TEACHER_PASSWORD_HASH is required",
      });
    }
    if (value.AI_PROVIDER === "openai" && !value.OPENAI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OPENAI_API_KEY"],
        message: "OPENAI_API_KEY is required when AI_PROVIDER=openai",
      });
    }
    if (value.TTS_PROVIDER === "openai" && !value.OPENAI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OPENAI_API_KEY"],
        message: "OPENAI_API_KEY is required when TTS_PROVIDER=openai",
      });
    }
    if (value.CARD_MIN > value.CARD_MAX) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["CARD_MIN"], message: "CARD_MIN must be <= CARD_MAX" });
    }
    if (value.QUESTIONNAIRE_MIN > value.QUESTIONNAIRE_MAX) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["QUESTIONNAIRE_MIN"],
        message: "QUESTIONNAIRE_MIN must be <= QUESTIONNAIRE_MAX",
      });
    }
    if (value.GAME_MIN > value.GAME_MAX) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["GAME_MIN"], message: "GAME_MIN must be <= GAME_MAX" });
    }
  });

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function parseEnv(raw: Record<string, string | undefined> = process.env): Env {
  return envSchema.parse(raw);
}

export function getEnv(): Env {
  if (!cached) {
    cached = parseEnv();
  }
  return cached;
}

export function resetEnvCache(): void {
  cached = null;
}

export const publicConfig = {
  defaultLocale: (process.env.DEFAULT_LOCALE === "en" ? "en" : "el") as "el" | "en",
  appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3000",
};
