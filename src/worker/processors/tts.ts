import type { PrismaClient } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { prisma as defaultPrisma } from "@/server/db";
import { probeDurationMs, renderPdfPageImages } from "@/server/media/ffmpeg";
import { getTtsProvider, type TtsProvider } from "@/server/media/tts";
import { enqueueStage, type PipelineJob } from "@/server/queue";
import { setLessonStatus } from "@/server/repositories/lesson-status";
import { getStorage, type LocalStorage } from "@/server/storage";

export async function processTts(
  data: PipelineJob,
  options: { provider?: TtsProvider; db?: PrismaClient; storage?: LocalStorage; enqueue?: boolean } = {},
): Promise<void> {
  const db = options.db ?? defaultPrisma;
  const storage = options.storage ?? getStorage();
  const lesson = await db.lesson.findUnique({
    where: { id: data.lessonId },
    include: { pages: true, narration: true },
  });
  if (!lesson || lesson.status === "CANCELLED") return;

  const locale = (data.locale ?? lesson.sourceLocale) as "el" | "en";
  const segments = lesson.narration
    .filter((segment) => segment.locale === locale && segment.script.trim().length > 0)
    .sort((a, b) => a.pageNumber - b.pageNumber);
  if (segments.length === 0) {
    throw new AppError("no_narration", `No narration is available for locale ${locale}`, 422);
  }

  await db.videoAsset.upsert({
    where: { lessonId_locale: { lessonId: lesson.id, locale } },
    create: { lessonId: lesson.id, locale, status: "PENDING" },
    update: { status: "PENDING", error: null },
  });
  await setLessonStatus(lesson.id, "RENDERING", {}, db);

  const provider = options.provider ?? getTtsProvider();
  for (const segment of segments) {
    const result = await provider.synthesize(segment.script, locale);
    const key = `lessons/${lesson.id}/audio/${locale}/page-${segment.pageNumber}.${result.extension}`;
    await storage.put(key, result.data);
    const durationMs = result.durationMs ?? (await probeDurationMs(storage.getAbsolutePath(key)));
    await db.narrationSegment.update({
      where: { id: segment.id },
      data: { audioKey: key, durationMs },
    });
  }

  await db.generationJob.upsert({
    where: { lessonId_stage: { lessonId: lesson.id, stage: "TTS" } },
    create: { lessonId: lesson.id, stage: "TTS", status: "COMPLETED", finishedAt: new Date() },
    update: { status: "COMPLETED", error: null, finishedAt: new Date() },
  });

  if (options.enqueue !== false) {
    await enqueueStage({ lessonId: lesson.id, stage: "render", version: data.version, locale });
  }
}

export async function ensurePageImages(
  lessonId: string,
  pdfPath: string,
  storage: LocalStorage,
): Promise<void> {
  await renderPdfPageImages(pdfPath, `${storage.getRoot()}/lessons/${lessonId}/pages`, { prefix: "page" });
}
