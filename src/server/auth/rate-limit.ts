import { getRedis } from "@/server/redis";
import { RateLimitError } from "@/lib/errors";
import { getEnv } from "@/lib/env";

export type RateLimitStore = {
  get(key: string): Promise<string | null>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  ttl(key: string): Promise<number>;
  del(key: string): Promise<unknown>;
};

function keyFor(ip: string): string {
  return `login:fail:${ip}`;
}

export async function assertLoginAllowed(ip: string, store: RateLimitStore = getRedis()): Promise<void> {
  const env = getEnv();
  const count = Number((await store.get(keyFor(ip))) ?? "0");
  if (count >= env.LOGIN_MAX_FAILURES) {
    const ttl = await store.ttl(keyFor(ip));
    throw new RateLimitError(ttl > 0 ? ttl : env.LOGIN_WINDOW_SECONDS);
  }
}

export async function recordLoginFailure(ip: string, store: RateLimitStore = getRedis()): Promise<void> {
  const env = getEnv();
  const key = keyFor(ip);
  const count = await store.incr(key);
  if (count === 1) {
    await store.expire(key, env.LOGIN_WINDOW_SECONDS);
  }
}

export async function clearLoginFailures(ip: string, store: RateLimitStore = getRedis()): Promise<void> {
  await store.del(keyFor(ip));
}

export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return headers.get("x-real-ip")?.trim() || "unknown";
}
