import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PrismaClient, type Prisma } from "@prisma/client";

let worker: ChildProcess | undefined;

const SNAPSHOT_PATH = path.join(os.tmpdir(), "lessonlab-e2e-class-snapshot.json");

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envFile = readFileSync(".env", "utf8");
  const match = envFile.match(/^DATABASE_URL=(.+)$/m);
  if (!match) throw new Error("DATABASE_URL is not configured");
  return match[1].trim();
}

function prismaClient() {
  return new PrismaClient({ datasources: { db: { url: databaseUrl() } } });
}

async function snapshotExistingClasses() {
  await rm(SNAPSHOT_PATH, { force: true });
  const prisma = prismaClient();
  try {
    const classes = await prisma.class.findMany({ select: { id: true } });
    await writeFile(SNAPSHOT_PATH, JSON.stringify(classes.map((item) => item.id)), "utf8");
  } finally {
    await prisma.$disconnect();
  }
}

async function removeClassesCreatedDuringRun() {
  let existingIds: string[];
  try {
    existingIds = JSON.parse(await readFile(SNAPSHOT_PATH, "utf8")) as string[];
  } catch {
    return;
  }

  const prisma = prismaClient();
  try {
    const where: Prisma.ClassWhereInput = existingIds.length ? { id: { notIn: existingIds } } : {};
    const created = await prisma.class.findMany({
      where,
      include: { lessons: { select: { id: true } } },
    });
    const storageRoot = process.env.STORAGE_ROOT || "./data";
    for (const classroom of created) {
      for (const lesson of classroom.lessons) {
        await rm(path.join(storageRoot, "lessons", lesson.id), { recursive: true, force: true });
      }
    }
    const deleted = await prisma.class.deleteMany({ where });
    if (deleted.count > 0) {
      console.log(`[e2e] Removed ${deleted.count} test classes and their lesson data.`);
    }
  } finally {
    await prisma.$disconnect();
    await rm(SNAPSHOT_PATH, { force: true });
  }
}

export default async function globalSetup() {
  await snapshotExistingClasses();

  worker = spawn("npm", ["run", "worker"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AI_PROVIDER: "mock",
      GENERATION_MAX_ATTEMPTS: "1",
      WORKER_AUTOSTART: "1",
    },
    stdio: "ignore",
    detached: true,
  });
  worker.unref();

  await new Promise((resolve) => setTimeout(resolve, 2500));

  return async () => {
    if (worker?.pid) {
      try {
        process.kill(-worker.pid, "SIGTERM");
      } catch {
        worker.kill("SIGTERM");
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    try {
      await removeClassesCreatedDuringRun();
    } catch (error) {
      console.warn("[e2e] Could not remove test classes", error);
    }
  };
}
