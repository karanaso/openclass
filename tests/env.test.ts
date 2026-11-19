import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

const base = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  AUTH_SECRET: "a".repeat(40),
  TEACHER_PASSWORD: "secret",
  AI_PROVIDER: "mock",
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
    expect(() => parseEnv({ ...base, AI_PROVIDER: "openai" })).toThrow(/OPENAI_API_KEY/);
  });

  it("uses the configured text model", () => {
    expect(parseEnv(base).OPENAI_TEXT_MODEL).toBe("gpt-4.1-mini");
    expect(parseEnv({ ...base, OPENAI_TEXT_MODEL: "gpt-test" }).OPENAI_TEXT_MODEL).toBe("gpt-test");
  });

  it("accepts every supported reasoning effort", () => {
    for (const effort of ["none", "low", "medium", "high", "xhigh", "max"] as const) {
      expect(parseEnv({ ...base, OPENAI_REASONING_EFFORT: effort }).OPENAI_REASONING_EFFORT).toBe(effort);
    }
  });

  it("leaves reasoning effort unset by default", () => {
    expect(parseEnv(base).OPENAI_REASONING_EFFORT).toBeUndefined();
  });

  it("rejects an unsupported reasoning effort", () => {
    expect(() => parseEnv({ ...base, OPENAI_REASONING_EFFORT: "extreme" })).toThrow(/OPENAI_REASONING_EFFORT/);
  });

  it("rejects inverted content ranges", () => {
    expect(() => parseEnv({ ...base, CARD_MIN: "20", CARD_MAX: "5" })).toThrow(/CARD_MIN/);
  });
});
