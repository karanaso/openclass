import argon2 from "argon2";
import { timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";

function safeEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  const length = Math.max(a.length, b.length, 1);
  const pa = Buffer.alloc(length);
  const pb = Buffer.alloc(length);
  a.copy(pa);
  b.copy(pb);
  return timingSafeEqual(pa, pb) && a.length === b.length;
}

export function isAuthConfigured(): boolean {
  const hasPassword = Boolean(process.env.TEACHER_PASSWORD || process.env.TEACHER_PASSWORD_HASH);
  return hasPassword && (process.env.AUTH_SECRET?.length ?? 0) >= 32;
}

export async function verifyTeacherPassword(provided: string): Promise<boolean> {
  const env = getEnv();
  if (env.TEACHER_PASSWORD_HASH) {
    try {
      return await argon2.verify(env.TEACHER_PASSWORD_HASH, provided);
    } catch {
      return false;
    }
  }
  if (env.TEACHER_PASSWORD) {
    return safeEqual(provided, env.TEACHER_PASSWORD);
  }
  return false;
}
