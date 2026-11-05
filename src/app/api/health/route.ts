import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { prisma } from "@/server/db";
import { getRedis } from "@/server/redis";
import { getStorage } from "@/server/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function GET() {
  const checks = {
    env: false,
    database: false,
    redis: false,
    storage: false,
  };

  try {
    getEnv();
    checks.env = true;
  } catch {
    checks.env = false;
  }

  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, 3000);
    checks.database = true;
  } catch {
    checks.database = false;
  }

  try {
    checks.redis = (await withTimeout(getRedis().ping(), 2000)) === "PONG";
  } catch {
    checks.redis = false;
  }

  try {
    const storage = getStorage();
    const key = `.health/${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await withTimeout(storage.put(key, "ok"), 2000);
    await withTimeout(storage.delete(key), 2000);
    checks.storage = true;
  } catch {
    checks.storage = false;
  }

  const ok = Object.values(checks).every(Boolean);
  return NextResponse.json(
    { status: ok ? "ok" : "degraded", checks, timestamp: new Date().toISOString() },
    { status: ok ? 200 : 503 },
  );
}
