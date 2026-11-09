import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/server/db";
import { ensureLessonNarration } from "@/server/generation/lesson-narration";
import type { ContentProvider } from "@/server/generation/provider";
import { enqueueStage, type PipelineJob } from "@/server/queue";

export async function processNarration(
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
    create: { lessonId: lesson.id, locale, status: "PENDING" },
    update: { status: "PENDING", error: null },
  });

  await ensureLessonNarration(lesson.id, { db, provider: options.provider });

  if (options.enqueue !== false) {
    await enqueueStage({
      lessonId: lesson.id,
      stage: "tts",
      version: data.version,
      locale,
      runId: data.runId,
    });
  }
}
