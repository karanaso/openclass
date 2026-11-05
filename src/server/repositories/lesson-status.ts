import type { LessonStatus, Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../db";

export async function setLessonStatus(
  lessonId: string,
  status: LessonStatus,
  data: Prisma.LessonUpdateInput = {},
  db: PrismaClient = defaultPrisma,
) {
  return db.lesson.update({
    where: { id: lessonId },
    data: {
      status,
      ...data,
      ...(status === "READY" ? { readyAt: new Date(), failureReason: null } : {}),
      ...(status === "FAILED" ? { readyAt: null } : {}),
    },
  });
}

export async function beginLessonStage(lessonId: string, status: LessonStatus, db: PrismaClient = defaultPrisma) {
  return setLessonStatus(lessonId, status, { processingStartedAt: new Date() }, db);
}

export async function getLessonOrThrow(lessonId: string, db: PrismaClient = defaultPrisma) {
  const lesson = await db.lesson.findUnique({ where: { id: lessonId }, include: { class: true } });
  if (!lesson) {
    throw new Error(`Lesson ${lessonId} not found`);
  }
  return lesson;
}
