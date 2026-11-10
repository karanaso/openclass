import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { isAppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { prisma as defaultPrisma } from "@/server/db";
import type { ContentProvider } from "@/server/generation/provider";
import { enqueueStage, type PipelineJob } from "@/server/queue";
import { ensureLessonStory } from "@/server/story/service";

export async function processStory(
  data: PipelineJob,
  options: { db?: PrismaClient; provider?: ContentProvider; enqueue?: boolean } = {},
): Promise<void> {
  const db = options.db ?? defaultPrisma;
  const lesson = await db.lesson.findUnique({
    where: { id: data.lessonId },
    select: { id: true, status: true, sourceLocale: true },
  });
  if (!lesson || lesson.status === "CANCELLED") return;

  const locale = (data.locale ?? lesson.sourceLocale) as "el" | "en";
  await db.videoAsset.upsert({
    where: { lessonId_locale: { lessonId: lesson.id, locale } },
    create: { lessonId: lesson.id, locale, status: "PENDING", contentVersion: data.version },
    update: {
      status: "PENDING",
      error: null,
      provider: null,
      providerJobId: null,
      providerStatus: null,
      progress: null,
      contentVersion: data.version,
      idempotencyKey: null,
      submittedAt: null,
      completedAt: null,
    },
  });

  try {
    await ensureLessonStory(lesson.id, { db, provider: options.provider });
    if (options.enqueue !== false) {
      await enqueueStage({
        lessonId: lesson.id,
        stage: "video-submit",
        version: data.version,
        locale,
        runId: data.runId ?? randomUUID(),
      });
    }
  } catch (error) {
    if (isAppError(error) && error.code === "story_in_progress") {
      throw error;
    }
    if (isAppError(error) && (error.code === "cancelled" || error.code === "not_found")) return;

    const message = error instanceof Error ? error.message.slice(0, 1_000) : "Story preparation failed";
    logger.error({ lessonId: lesson.id, locale, err: error }, "story preparation failed");
    await db.videoAsset
      .update({
        where: { lessonId_locale: { lessonId: lesson.id, locale } },
        data: { status: "FAILED", error: message },
      })
      .catch((dbError) => logger.error({ lessonId: lesson.id, locale, err: dbError }, "could not mark video failed"));
  }
}
