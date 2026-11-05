import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GenericContainer, type StartedTestContainer } from "testcontainers";
import { resetEnvCache } from "@/lib/env";
import { closeRedis } from "@/server/redis";
import { createSessionToken } from "@/server/auth/session";
import { POST as login } from "@/app/api/auth/login/route";
import { GET as adminSession } from "@/app/api/admin/session/route";

let redis: StartedTestContainer;

beforeAll(async () => {
  redis = await new GenericContainer("redis:7-alpine").withExposedPorts(6379).start();
  process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
  process.env.AUTH_SECRET = "a".repeat(40);
  process.env.TEACHER_PASSWORD = "correct-horse";
  process.env.AI_PROVIDER = "mock";
  process.env.TTS_PROVIDER = "mock";
  process.env.REDIS_URL = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
  process.env.LOGIN_MAX_FAILURES = "3";
  process.env.LOGIN_WINDOW_SECONDS = "60";
  resetEnvCache();
  await closeRedis();
}, 120_000);

afterAll(async () => {
  await closeRedis();
  await redis?.stop();
});

function loginRequest(password: string, ip = "10.0.0.1") {
  return new Request("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ password }),
  });
}

describe("login route", () => {
  it("sets a session cookie for the correct password", async () => {
    const response = await login(loginRequest("correct-horse"));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("teacher_session=");
  });

  it("rejects a wrong password without revealing details", async () => {
    const response = await login(loginRequest("wrong", "10.0.0.2"));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("invalid_credentials");
  });

  it("returns 503 when authentication is not configured", async () => {
    delete process.env.TEACHER_PASSWORD;
    delete process.env.TEACHER_PASSWORD_HASH;
    resetEnvCache();
    const response = await login(loginRequest("anything", "10.0.0.3"));
    expect(response.status).toBe(503);
    process.env.TEACHER_PASSWORD = "correct-horse";
    resetEnvCache();
  });

  it("returns 401 for an unauthenticated admin API", async () => {
    const response = await adminSession(new Request("http://localhost:3000/api/admin/session"));
    expect(response.status).toBe(401);
  });

  it("accepts an authenticated admin API request", async () => {
    const token = await createSessionToken();
    const response = await adminSession(
      new Request("http://localhost:3000/api/admin/session", {
        headers: { cookie: `teacher_session=${token}` },
      }),
    );
    expect(response.status).toBe(200);
  });

  it("rate-limits repeated failures", async () => {
    for (let index = 0; index < 3; index += 1) {
      const response = await login(loginRequest("wrong", "10.0.0.4"));
      expect(response.status).toBe(401);
    }
    const blocked = await login(loginRequest("wrong", "10.0.0.4"));
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
  });
});
