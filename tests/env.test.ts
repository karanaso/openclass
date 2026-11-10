import { describe, expect, it } from "vitest";
import { effectiveImageProvider, parseEnv } from "@/lib/env";

const base = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  AUTH_SECRET: "a".repeat(40),
  TEACHER_PASSWORD: "secret",
  AI_PROVIDER: "mock",
  TTS_PROVIDER: "mock",
};

describe("parseEnv", () => {
  it("accepts a valid mock configuration without an OpenAI key", () => {
    const env = parseEnv(base);
    expect(env.DEFAULT_LOCALE).toBe("el");
    expect(env.AI_PROVIDER).toBe("mock");
  });

  it("rejects a missing database URL", () => {
    expect(() => parseEnv({ ...base, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });

  it("rejects a short auth secret", () => {
    expect(() => parseEnv({ ...base, AUTH_SECRET: "short" })).toThrow(/AUTH_SECRET/);
  });

  it("rejects a configuration with no teacher password", () => {
    expect(() => parseEnv({ ...base, TEACHER_PASSWORD: undefined })).toThrow(/TEACHER_PASSWORD/);
  });

  it("requires an OpenAI key when the OpenAI provider is selected", () => {
    expect(() => parseEnv({ ...base, AI_PROVIDER: "openai", TTS_PROVIDER: "mock" })).toThrow(/OPENAI_API_KEY/);
  });

  it("follows AI_PROVIDER for image generation and sets image defaults", () => {
    const env = parseEnv(base);
    expect(effectiveImageProvider(env)).toBe("mock");
    expect(env.OPENAI_IMAGE_MODEL).toBe("gpt-image-1");
    expect(env.OPENAI_IMAGE_QUALITY).toBe("high");
  });

  it("defaults the art-direction model to the text model", () => {
    expect(parseEnv(base).OPENAI_ART_DIRECTION_MODEL).toBeUndefined();
    expect(parseEnv({ ...base, OPENAI_TEXT_MODEL: "gpt-test" }).OPENAI_TEXT_MODEL).toBe("gpt-test");
    expect(parseEnv({ ...base, OPENAI_ART_DIRECTION_MODEL: "gpt-brief" }).OPENAI_ART_DIRECTION_MODEL).toBe(
      "gpt-brief",
    );
  });

  it("requires an OpenAI key when image generation explicitly selects OpenAI", () => {
    expect(() => parseEnv({ ...base, IMAGE_PROVIDER: "openai" })).toThrow(/OPENAI_API_KEY/);
  });

  it("accepts a disabled image provider without an OpenAI key", () => {
    const env = parseEnv({ ...base, IMAGE_PROVIDER: "disabled" });
    expect(effectiveImageProvider(env)).toBe("disabled");
  });

  it("lets an explicit image provider override AI_PROVIDER", () => {
    const env = parseEnv({
      ...base,
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test",
      TTS_PROVIDER: "openai",
      IMAGE_PROVIDER: "mock",
    });
    expect(effectiveImageProvider(env)).toBe("mock");
  });

  it("rejects inverted content ranges", () => {
    expect(() => parseEnv({ ...base, CARD_MIN: "20", CARD_MAX: "5" })).toThrow(/CARD_MIN/);
  });

  it("defaults video generation to disabled without network configuration", () => {
    const env = parseEnv(base);
    expect(env.VIDEO_PROVIDER).toBe("disabled");
    expect(env.VIDEO_AI_BASE_URL).toBeUndefined();
    expect(env.VIDEO_AI_POLL_INTERVAL_MS).toBe(5_000);
    expect(env.STORY_MIN_SCENES).toBe(3);
  });

  it("accepts mock and disabled video providers without a base URL", () => {
    expect(parseEnv({ ...base, VIDEO_PROVIDER: "mock" }).VIDEO_PROVIDER).toBe("mock");
    expect(parseEnv({ ...base, VIDEO_PROVIDER: "disabled" }).VIDEO_PROVIDER).toBe("disabled");
  });

  it("requires a base URL for the HTTP video provider", () => {
    expect(() => parseEnv({ ...base, VIDEO_PROVIDER: "api" })).toThrow(/VIDEO_AI_BASE_URL/);
    expect(
      parseEnv({ ...base, VIDEO_PROVIDER: "api", VIDEO_AI_BASE_URL: "https://video.example.test" }).VIDEO_PROVIDER,
    ).toBe("api");
  });

  it("rejects inverted story scene ranges", () => {
    expect(() => parseEnv({ ...base, STORY_MIN_SCENES: "10", STORY_MAX_SCENES: "5" })).toThrow(/STORY_MIN_SCENES/);
  });
});
