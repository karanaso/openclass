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
    IMAGE_PROVIDER: z.enum(["openai", "mock", "disabled"]).optional(),
    OPENAI_TEXT_MODEL: z.string().default("gpt-4.1-mini"),
    OPENAI_ART_DIRECTION_MODEL: z.string().optional(),
    OPENAI_TTS_MODEL: z.string().default("gpt-4o-mini-tts"),
    OPENAI_IMAGE_MODEL: z.string().default("gpt-image-1"),
    OPENAI_IMAGE_QUALITY: z.enum(["low", "medium", "high", "auto"]).default("high"),
    OPENAI_TTS_VOICE_EL: z.string().default("alloy"),
    OPENAI_TTS_VOICE_EN: z.string().default("alloy"),
    VIDEO_PROVIDER: z.enum(["api", "mock", "disabled"]).default("disabled"),
    VIDEO_AI_BASE_URL: z.string().url().optional(),
    VIDEO_AI_API_KEY: z.string().min(1).optional(),
    VIDEO_AI_MODEL: z.string().min(1).optional(),
    VIDEO_AI_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5_000),
    VIDEO_AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
    VIDEO_AI_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(1_800),
    VIDEO_MAX_OUTPUT_BYTES: z.coerce.number().int().positive().default(512 * 1024 * 1024),
    STORY_MODEL: z.string().min(1).optional(),
    STORY_MIN_SCENES: z.coerce.number().int().positive().default(3),
    STORY_MAX_SCENES: z.coerce.number().int().positive().default(20),
    STORY_CHUNK_CHARS: z.coerce.number().int().positive().default(48_000),
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
    const imageProvider = value.IMAGE_PROVIDER ?? value.AI_PROVIDER;
    if (imageProvider === "openai" && !value.OPENAI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OPENAI_API_KEY"],
        message: "OPENAI_API_KEY is required when IMAGE_PROVIDER=openai",
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
    if (value.VIDEO_PROVIDER === "api" && !value.VIDEO_AI_BASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["VIDEO_AI_BASE_URL"],
        message: "VIDEO_AI_BASE_URL is required when VIDEO_PROVIDER=api",
      });
    }
    if (value.STORY_MIN_SCENES > value.STORY_MAX_SCENES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["STORY_MIN_SCENES"],
        message: "STORY_MIN_SCENES must be <= STORY_MAX_SCENES",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export type ImageProviderMode = "openai" | "mock" | "disabled";

export function effectiveImageProvider(
  env: Pick<Env, "IMAGE_PROVIDER" | "AI_PROVIDER">,
): ImageProviderMode {
  return env.IMAGE_PROVIDER ?? env.AI_PROVIDER;
}

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
