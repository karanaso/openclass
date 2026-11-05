import argon2 from "argon2";
import { beforeEach, describe, expect, it } from "vitest";
import { resetEnvCache } from "@/lib/env";
import { UnauthorizedError } from "@/lib/errors";
import { assertSameOrigin } from "@/server/auth/guard";
import { verifyTeacherPassword } from "@/server/auth/password";
import { assertLoginAllowed, clearLoginFailures, recordLoginFailure, type RateLimitStore } from "@/server/auth/rate-limit";
import { createSessionToken, verifySessionToken } from "@/server/auth/session";

const baseEnv = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  AUTH_SECRET: "a".repeat(40),
  TEACHER_PASSWORD: "correct-horse",
  AI_PROVIDER: "mock",
  TTS_PROVIDER: "mock",
  LOGIN_MAX_FAILURES: "3",
  LOGIN_WINDOW_SECONDS: "60",
};

function setEnv(overrides: Record<string, string | undefined> = {}) {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("TEACHER_") || key === "AUTH_SECRET" || key === "DATABASE_URL") {
      delete process.env[key];
    }
  }
  Object.assign(process.env, { ...baseEnv, ...overrides });
  resetEnvCache();
}

beforeEach(() => {
  setEnv();
});

describe("teacher password", () => {
  it("accepts the configured plaintext password and rejects others", async () => {
    expect(await verifyTeacherPassword("correct-horse")).toBe(true);
    expect(await verifyTeacherPassword("wrong")).toBe(false);
  });

  it("verifies an Argon2 hash when present", async () => {
    const hash = await argon2.hash("hashed-password", { type: argon2.argon2id });
    setEnv({ TEACHER_PASSWORD: undefined, TEACHER_PASSWORD_HASH: hash });
    expect(await verifyTeacherPassword("hashed-password")).toBe(true);
    expect(await verifyTeacherPassword("nope")).toBe(false);
  });
});

describe("teacher session", () => {
  it("round-trips a signed token", async () => {
    const token = await createSessionToken();
    expect(await verifySessionToken(token)).toEqual({ role: "teacher" });
  });

  it("rejects tampered and expired tokens", async () => {
    const token = await createSessionToken();
    expect(await verifySessionToken(`${token}x`)).toBeNull();
    const expired = await createSessionToken(-1);
    expect(await verifySessionToken(expired)).toBeNull();
  });
});

class FakeStore implements RateLimitStore {
  values = new Map<string, number>();
  expirations = new Map<string, number>();

  async get(key: string) {
    return this.expirations.has(key) && this.expirations.get(key)! < Date.now()
      ? null
      : String(this.values.get(key) ?? 0);
  }
  async incr(key: string) {
    const value = (this.values.get(key) ?? 0) + 1;
    this.values.set(key, value);
    return value;
  }
  async expire(key: string, seconds: number) {
    this.expirations.set(key, Date.now() + seconds * 1000);
    return 1;
  }
  async ttl(key: string) {
    const exp = this.expirations.get(key);
    return exp ? Math.max(1, Math.round((exp - Date.now()) / 1000)) : -1;
  }
  async del(key: string) {
    this.values.delete(key);
    this.expirations.delete(key);
    return 1;
  }
}

describe("login throttling", () => {
  it("locks out after the threshold and clears on success", async () => {
    const store = new FakeStore();
    await recordLoginFailure("1.2.3.4", store);
    await recordLoginFailure("1.2.3.4", store);
    await assertLoginAllowed("1.2.3.4", store);
    await recordLoginFailure("1.2.3.4", store);
    await expect(assertLoginAllowed("1.2.3.4", store)).rejects.toThrow(/Too many/);
    await clearLoginFailures("1.2.3.4", store);
    await expect(assertLoginAllowed("1.2.3.4", store)).resolves.toBeUndefined();
  });
});

describe("origin checks", () => {
  it("rejects a cross-origin mutation", () => {
    const request = new Request("http://localhost:3000/api/admin/classes", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });
    expect(() => assertSameOrigin(request)).toThrow(UnauthorizedError);
  });

  it("allows same-origin mutations and safe reads", () => {
    expect(() =>
      assertSameOrigin(new Request("http://localhost:3000/api/admin/classes", { method: "POST", headers: { origin: "http://localhost:3000" } })),
    ).not.toThrow();
    expect(() =>
      assertSameOrigin(new Request("http://localhost:3000/api/admin/classes", { method: "GET", headers: { origin: "https://evil.example" } })),
    ).not.toThrow();
  });
});
