import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { prisma as defaultPrisma } from "@/server/db";
import type { PipelineJob } from "@/server/queue";
import { enqueueStage } from "@/server/queue";
import type { VideoProvider } from "@/server/video/provider";
import { getVideoProvider } from "@/server/video/provider-factory";

async function markFailed(
  db: PrismaClient,
  lessonId: string,
  locale: string,
  message: string,
  status: "FAILED" | "SKIPPED" = "FAILED",
) {
  await db.videoAsset
    .update({
      where: { lessonId_locale: { lessonId, locale } },
      data: { status, error: message.slice(0, 1_000), completedAt: new Date() },
    })
    .catch((error) => logger.error({ lessonId, locale, err: error }, "could not mark video failed"));
}

export async function processVideoSubmit(
  data: PipelineJob,
  options: { db?: PrismaClient; provider?: VideoProvider; enqueue?: boolean } = {},
): Promise<void> {
  const db = options.db ?? defaultPrisma;
  const env = getEnv();
  const lesson = await db.lesson.findUnique({
    where: { id: data.lessonId },
    include: {
      story: { include: { scenes: { orderBy: { position: "asc" } } } },
      videos: true,
    },
  });
  if (!lesson || lesson.status === "CANCELLED") return;

  const locale = (data.locale ?? lesson.sourceLocale) as "el" | "en";
  const video = lesson.videos.find((item) => item.locale === locale);
  if (video?.providerJobId && (video.status === "PENDING" || video.status === "RENDERING")) {
    logger.info({ lessonId: lesson.id, locale }, "video provider job already active");
    return;
  }

  if (!lesson.story || lesson.story.status !== "READY" || lesson.story.jobVersion !== lesson.jobVersion) {
    await markFailed(db, lesson.id, locale, "A current story is required before video submission");
    return;
  }

  const provider = options.provider ?? getVideoProvider();
  const idempotencyKey =
    video?.idempotencyKey && video.contentVersion === lesson.jobVersion
      ? video.idempotencyKey
      : `${lesson.id}:${locale}:${lesson.jobVersion}:${data.runId ?? randomUUID()}`;

  const scenes = lesson.story.scenes.map((scene) => ({
    sceneKey: scene.sceneKey,
    sourcePages: Array.isArray(scene.sourcePages) ? (scene.sourcePages as number[]) : [],
    narration: locale === "el" ? scene.narrationEl : scene.narrationEn,
    ...(scene.visualDirection ? { visualDirection: scene.visualDirection } : {}),
  }));

  await db.videoAsset.upsert({
    where: { lessonId_locale: { lessonId: lesson.id, locale } },
    create: {
      lessonId: lesson.id,
      locale,
      status: "RENDERING",
      provider: provider.name,
      providerStatus: "submitting",
      progress: 0,
      contentVersion: lesson.jobVersion,
      idempotencyKey,
      submittedAt: new Date(),
    },
    update: {
      status: "RENDERING",
      error: null,
      provider: provider.name,
      providerJobId: null,
      providerStatus: "submitting",
      progress: 0,
      contentVersion: lesson.jobVersion,
      idempotencyKey,
      submittedAt: new Date(),
      completedAt: null,
    },
  });

  try {
    const submitted = await provider.submit({
      lessonId: lesson.id,
      locale,
      contentVersion: lesson.jobVersion,
      idempotencyKey,
      title: lesson.story.title ?? lesson.title,
      story: {
        title: lesson.story.title ?? lesson.title,
        logline: lesson.story.logline ?? "",
        scenes,
      },
    });

    await db.videoAsset.update({
      where: { lessonId_locale: { lessonId: lesson.id, locale } },
      data: {
        provider: provider.name,
        providerJobId: submitted.id,
        providerStatus: submitted.status,
        progress: 0,
        submittedAt: new Date(),
      },
    });

    if (options.enqueue !== false) {
      await enqueueStage(
        {
          lessonId: lesson.id,
          stage: "video-poll",
          version: data.version,
          locale,
          runId: randomUUID(),
        },
        env.VIDEO_AI_POLL_INTERVAL_MS,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1_000) : "Video submission failed";
    logger.error({ lessonId: lesson.id, locale, err: error }, "video submission failed");
    await markFailed(db, lesson.id, locale, message);
  }
}

export async function processVideoPoll(
  data: PipelineJob,
  options: {
    db?: PrismaClient;
    provider?: VideoProvider;
    storage?: import("@/server/storage").LocalStorage;
    enqueue?: boolean;
  } = {},
): Promise<void> {
  const db = options.db ?? defaultPrisma;
  const env = getEnv();
  const lesson = await db.lesson.findUnique({
    where: { id: data.lessonId },
    include: { videos: true },
  });
  if (!lesson || lesson.status === "CANCELLED") return;

  const locale = (data.locale ?? lesson.sourceLocale) as "el" | "en";
  const video = lesson.videos.find((item) => item.locale === locale);
  if (!video?.providerJobId) {
    await markFailed(db, lesson.id, locale, "Video provider job id is missing");
    return;
  }
  if (video.status === "READY" || video.status === "FAILED" || video.status === "SKIPPED") return;

  if (video.contentVersion !== lesson.jobVersion) {
    await markFailed(db, lesson.id, locale, "Lesson content changed while the video was processing");
    return;
  }

  const submittedAt = video.submittedAt?.getTime() ?? 0;
  if (submittedAt > 0 && Date.now() - submittedAt > env.VIDEO_AI_TIMEOUT_SECONDS * 1000) {
    await markFailed(db, lesson.id, locale, "Video provider timed out");
    return;
  }

  const provider = options.provider ?? getVideoProvider();
  try {
    const job = await provider.getJob(video.providerJobId);
    if (job.status === "failed") {
      await markFailed(db, lesson.id, locale, job.error ?? "Video provider reported a failure");
      return;
    }
    if (job.status !== "completed") {
      await db.videoAsset.update({
        where: { lessonId_locale: { lessonId: lesson.id, locale } },
        data: {
          status: "RENDERING",
          providerStatus: job.status,
          progress: typeof job.progress === "number" ? job.progress : undefined,
        },
      });
      if (options.enqueue !== false) {
        await enqueueStage(
          {
            lessonId: lesson.id,
            stage: "video-poll",
            version: data.version,
            locale,
            runId: randomUUID(),
          },
          env.VIDEO_AI_POLL_INTERVAL_MS,
        );
      }
      return;
    }

    const storage = options.storage ?? (await import("@/server/storage")).getStorage();
    const { ingestVideoOutput } = await import("@/server/video/ingest");
    const ingested = await ingestVideoOutput({
      lessonId: lesson.id,
      locale,
      job,
      provider,
      storage,
    });

    await db.videoAsset.update({
      where: { lessonId_locale: { lessonId: lesson.id, locale } },
      data: {
        status: "READY",
        storageKey: ingested.videoKey,
        captionsKey: ingested.captionsKey,
        posterKey: ingested.posterKey,
        durationMs: ingested.durationMs,
        sizeBytes: ingested.sizeBytes,
        providerStatus: "completed",
        progress: 100,
        completedAt: new Date(),
        error: null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1_000) : "Video provider poll failed";
    logger.error({ lessonId: lesson.id, locale, err: error }, "video provider poll failed");
    const skipped = error instanceof AppError && (error.code === "video_too_long");
    await markFailed(db, lesson.id, locale, message, skipped ? "SKIPPED" : "FAILED");
  }
}
