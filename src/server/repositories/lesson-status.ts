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
