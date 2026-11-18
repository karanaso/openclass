import argon2 from "argon2";
import { beforeEach, describe, expect, it } from "vitest";
import { resetEnvCache } from "@/lib/env";
import { UnauthorizedError } from "@/lib/errors";
import { assertSameOrigin } from "@/server/auth/guard";
import { verifyTeacherPassword } from "@/server/auth/password";
import { assertLoginAllowed, clearLoginFailures, recordLoginFailure, assertCodeLookupAllowed, clearCodeFailures, recordCodeFailure, type RateLimitStore } from "@/server/auth/rate-limit";
import { createSessionToken, verifySessionToken } from "@/server/auth/session";

const baseEnv = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  AUTH_SECRET: "a".repeat(40),
  TEACHER_PASSWORD: "correct-horse",
  AI_PROVIDER: "mock",
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
    if (!exp) return -1;
    const remaining = Math.round((exp - Date.now()) / 1000);
    return remaining > 0 ? remaining : -1;
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

describe("access code throttling", () => {
  it("allows four failures and locks after the fifth", async () => {
    const store = new FakeStore();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await recordCodeFailure("5.6.7.8", store);
    }
    await expect(assertCodeLookupAllowed("5.6.7.8", store)).resolves.toBeUndefined();

    await recordCodeFailure("5.6.7.8", store);
    await expect(assertCodeLookupAllowed("5.6.7.8", store)).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("reports the remaining lockout time", async () => {
    const store = new FakeStore();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await recordCodeFailure("5.6.7.8", store);
    }

    await expect(assertCodeLookupAllowed("5.6.7.8", store)).rejects.toMatchObject({
      retryAfterSeconds: expect.any(Number),
    });
    try {
      await assertCodeLookupAllowed("5.6.7.8", store);
    } catch (error) {
      const retryAfter = (error as { retryAfterSeconds: number }).retryAfterSeconds;
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(30);
    }
  });

  it("lets the client retry after the lockout expires", async () => {
    const store = new FakeStore();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await recordCodeFailure("5.6.7.8", store);
    }
    for (const key of store.expirations.keys()) {
      store.expirations.set(key, Date.now() - 1);
    }
    await expect(assertCodeLookupAllowed("5.6.7.8", store)).resolves.toBeUndefined();
  });

  it("clears failures after a successful lookup", async () => {
    const store = new FakeStore();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await recordCodeFailure("5.6.7.8", store);
    }
    await clearCodeFailures("5.6.7.8", store);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      await recordCodeFailure("5.6.7.8", store);
    }
    await expect(assertCodeLookupAllowed("5.6.7.8", store)).resolves.toBeUndefined();
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
