import { randomInt } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { LESSON_ACCESS_CODE_MIN, LESSON_ACCESS_CODE_UPPER_BOUND } from "@/lib/lesson-code";
import { prisma as defaultPrisma } from "@/server/db";

export const ACCESS_CODE_MAX_ATTEMPTS = 10;

type AccessCodeDb = Pick<PrismaClient, "lesson">;
type GenerateAccessCode = () => string;

export function newLessonAccessCode(): string {
  return String(randomInt(LESSON_ACCESS_CODE_MIN, LESSON_ACCESS_CODE_UPPER_BOUND));
}

export function isAccessCodeUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; meta?: { target?: unknown } };
  if (candidate.code !== "P2002") return false;
  const target = candidate.meta?.target;
  if (Array.isArray(target)) return target.includes("accessCode");
  return typeof target === "string" && target.includes("accessCode");
}

function exhausted(): AppError {
  return new AppError("access_code_unavailable", "Could not assign a lesson access code", 500);
}

export async function assignAccessCode(
  db: AccessCodeDb = defaultPrisma,
  generate: GenerateAccessCode = newLessonAccessCode,
): Promise<string> {
  for (let attempt = 0; attempt < ACCESS_CODE_MAX_ATTEMPTS; attempt += 1) {
    const candidate = generate();
    const existing = await db.lesson.findUnique({
      where: { accessCode: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  throw exhausted();
}

export async function regenerateAccessCode(
  lessonId: string,
  db: AccessCodeDb = defaultPrisma,
  generate: GenerateAccessCode = newLessonAccessCode,
): Promise<string> {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    select: { id: true, accessCode: true },
  });
  if (!lesson) throw new AppError("not_found", "Lesson not found", 404);

  for (let attempt = 0; attempt < ACCESS_CODE_MAX_ATTEMPTS; attempt += 1) {
    const candidate = generate();
    if (candidate === lesson.accessCode) continue;

    try {
      const updated = await db.lesson.update({
        where: { id: lessonId },
        data: { accessCode: candidate },
        select: { accessCode: true },
      });
      return updated.accessCode;
    } catch (error) {
      if (isAccessCodeUniqueViolation(error)) continue;
      throw error;
    }
  }
  throw exhausted();
}
