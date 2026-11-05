import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/server/db";
import { enqueueStage, removeJobsForLesson } from "@/server/queue";
import { getStorage, type LocalStorage } from "@/server/storage";
import { AppError } from "@/lib/errors";

export async function retryLesson(
  lessonId: string,
  db: PrismaClient = defaultPrisma,
  queue: { enqueue: typeof enqueueStage; remove: typeof removeJobsForLesson } = {
    enqueue: enqueueStage,
    remove: removeJobsForLesson,
  },
) {
  const lesson = await db.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson) throw new AppError("not_found", "Lesson not found", 404);

  const version = lesson.jobVersion + 1;
  const updated = await db.lesson.update({
    where: { id: lessonId },
    data: { status: "QUEUED", failureReason: null, jobVersion: version, readyAt: null },
  });
  await queue.enqueue({ lessonId, stage: "extract", version });
  return updated;
}

export async function cancelLesson(
  lessonId: string,
  db: PrismaClient = defaultPrisma,
  storage: LocalStorage = getStorage(),
) {
  const lesson = await db.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson) throw new AppError("not_found", "Lesson not found", 404);

  await removeJobsForLesson(lessonId, lesson.jobVersion);
  const updated = await db.lesson.update({
    where: { id: lessonId },
    data: { status: "CANCELLED", failureReason: null },
  });

  await storage.deletePrefix(`lessons/${lessonId}/pages`).catch(() => undefined);
  await storage.deletePrefix(`lessons/${lessonId}/audio`).catch(() => undefined);
  await storage.deletePrefix(`lessons/${lessonId}/video`).catch(() => undefined);
  await db.card.deleteMany({ where: { lessonId } });
  await db.question.deleteMany({ where: { lessonId } });
  await db.narrationSegment.deleteMany({ where: { lessonId } });
  await db.videoAsset.deleteMany({ where: { lessonId } });

  return updated;
}

export async function deleteLesson(
  lessonId: string,
  db: PrismaClient = defaultPrisma,
  storage: LocalStorage = getStorage(),
) {
  const lesson = await db.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson) throw new AppError("not_found", "Lesson not found", 404);
  await db.lesson.delete({ where: { id: lessonId } });
  await storage.deletePrefix(`lessons/${lessonId}`);
  return { ok: true };
}
