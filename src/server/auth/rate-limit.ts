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

function codeFailureKeyFor(ip: string): string {
  return `lesson-code:fail:${ip}`;
}

function codeLockKeyFor(ip: string): string {
  return `lesson-code:lock:${ip}`;
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

export async function assertCodeLookupAllowed(
  ip: string,
  store: RateLimitStore = getRedis(),
): Promise<void> {
  const ttl = await store.ttl(codeLockKeyFor(ip));
  if (ttl > 0) {
    throw new RateLimitError(ttl);
  }
}

export async function recordCodeFailure(ip: string, store: RateLimitStore = getRedis()): Promise<void> {
  const env = getEnv();
  const windowSeconds = env.LESSON_CODE_LOCKOUT_SECONDS;
  const failureKey = codeFailureKeyFor(ip);
  const count = await store.incr(failureKey);
  if (count === 1) {
    await store.expire(failureKey, windowSeconds);
  }
  if (count >= env.LESSON_CODE_MAX_FAILURES) {
    await store.expire(failureKey, windowSeconds);
    const lockKey = codeLockKeyFor(ip);
    await store.del(lockKey);
    await store.incr(lockKey);
    await store.expire(lockKey, windowSeconds);
  }
}

export async function clearCodeFailures(ip: string, store: RateLimitStore = getRedis()): Promise<void> {
  await store.del(codeFailureKeyFor(ip));
  await store.del(codeLockKeyFor(ip));
}

export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return headers.get("x-real-ip")?.trim() || "unknown";
}
