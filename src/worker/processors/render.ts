import { mkdtemp, rm, statfs } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { prisma as defaultPrisma } from "@/server/db";
import { renderPdfPageImages } from "@/server/media/ffmpeg";
import type { ImageProvider } from "@/server/media/image";
import { ensureLessonVisual } from "@/server/media/lesson-visual";
import { composeLessonVideo, type SlideInput } from "@/server/media/render-video";
import type { PipelineJob } from "@/server/queue";
import { getStorage, type LocalStorage } from "@/server/storage";

async function markVideo(
  lessonId: string,
  locale: string,
  status: "SKIPPED" | "FAILED" | "READY" | "RENDERING",
  data: Record<string, unknown> = {},
  db: PrismaClient,
) {
  return db.videoAsset.upsert({
    where: { lessonId_locale: { lessonId, locale } },
    create: { lessonId, locale, status, ...data },
    update: { status, ...data },
  });
}

export async function processRender(
  data: PipelineJob,
  options: { db?: PrismaClient; storage?: LocalStorage; imageProvider?: ImageProvider | null } = {},
): Promise<void> {
  const db = options.db ?? defaultPrisma;
  const storage = options.storage ?? getStorage();
  const env = getEnv();
  const lesson = await db.lesson.findUnique({
    where: { id: data.lessonId },
    include: { pages: { orderBy: { pageNumber: "asc" } }, narration: true },
  });
  if (!lesson || lesson.status === "CANCELLED") return;

  const locale = (data.locale ?? lesson.sourceLocale) as "el" | "en";
  await markVideo(lesson.id, locale, "RENDERING", {}, db);

  const skip = async (reason: string) => {
    await markVideo(lesson.id, locale, "SKIPPED", { error: reason }, db);
    logger.warn({ lessonId: lesson.id, locale, reason }, "video rendering skipped");
  };

  try {
    if (lesson.pages.length > env.MAX_PDF_PAGES) {
      await skip(`Lesson exceeds the ${env.MAX_PDF_PAGES}-page video limit`);
      return;
    }
    if (lesson.pages.length === 0) {
      await skip("Lesson has no pages to render");
      return;
    }

    const pdfPath = storage.getAbsolutePath(lesson.storageKey);
    const imagesDirectory = path.join(storage.getRoot(), "lessons", lesson.id, "pages");

    let imagesComplete = true;
    for (const page of lesson.pages) {
      if (!(await storage.exists(`lessons/${lesson.id}/pages/page-${page.pageNumber}.png`))) {
        imagesComplete = false;
        break;
      }
    }
    if (!imagesComplete) {
      await renderPdfPageImages(pdfPath, imagesDirectory, { maxPages: env.MAX_PDF_PAGES, prefix: "page" });
    }

    const slides: SlideInput[] = [];
    for (const page of lesson.pages) {
      const narration = lesson.narration.find(
        (segment) => segment.pageNumber === page.pageNumber && segment.locale === locale,
      );
      if (!narration?.audioKey || !narration.durationMs) {
        throw new AppError("missing_audio", `Narration audio is missing for page ${page.pageNumber}`, 422);
      }
      if (!(await storage.exists(narration.audioKey))) {
        throw new AppError("missing_audio", `Narration audio file is missing for page ${page.pageNumber}`, 422);
      }
      slides.push({
        pageNumber: page.pageNumber,
        imagePath: path.join(imagesDirectory, `page-${page.pageNumber}.png`),
        audioPath: storage.getAbsolutePath(narration.audioKey),
        audioDurationMs: narration.durationMs,
        script: narration.script,
      });
    }

    const estimatedDuration = slides.reduce((sum, slide) => sum + slide.audioDurationMs + 600, 0);
    if (estimatedDuration > env.MAX_VIDEO_SECONDS * 1000) {
      await skip(`Video would exceed the ${env.MAX_VIDEO_SECONDS}-second limit`);
      return;
    }

    const disk = await statfs(storage.getRoot());
    const freeBytes = Number(disk.bavail) * Number(disk.bsize);
    if (freeBytes < 512 * 1024 * 1024) {
      await skip("Not enough free disk space to render the video");
      return;
    }

    const workDir = await mkdtemp(path.join(os.tmpdir(), "lessonlab-video-"));
    try {
      const visual = await ensureLessonVisual(
        { id: lesson.id, title: lesson.title, jobVersion: lesson.jobVersion, pages: lesson.pages },
        { db, storage, provider: options.imageProvider },
      );
      const composed = await composeLessonVideo({ slides, workDir, visual });
      const videoKey = `lessons/${lesson.id}/video/${locale}.mp4`;
      const captionsKey = `lessons/${lesson.id}/video/${locale}.vtt`;
      const posterKey = `lessons/${lesson.id}/video/${locale}.jpg`;
      await storage.putFile(videoKey, composed.videoPath);
      await storage.putFile(captionsKey, composed.captionsPath);
      await storage.putFile(posterKey, composed.posterPath);

      await markVideo(
        lesson.id,
        locale,
        "READY",
        {
          storageKey: videoKey,
          captionsKey,
          posterKey,
          durationMs: composed.durationMs,
          sizeBytes: composed.sizeBytes,
          error: null,
        },
        db,
      );
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : "Video rendering failed";
    logger.error({ lessonId: lesson.id, locale, err: error }, "video rendering failed");
    await markVideo(lesson.id, locale, "FAILED", { error: message }, db);
  }
}
