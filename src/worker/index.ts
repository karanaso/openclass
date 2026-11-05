import { Worker } from "bullmq";
import { getEnv } from "../lib/env";
import { logger } from "../lib/logger";
import { prisma } from "../server/db";
import { LESSON_QUEUE, type PipelineJob } from "../server/queue";
import { getRedis } from "../server/redis";
import { processExtract } from "./processors/extract";
import { processGenerate } from "./processors/generate";
import { processRender } from "./processors/render";
import { processTts } from "./processors/tts";

export function createPipelineWorker(): Worker<PipelineJob> {
  const env = getEnv();
  const worker = new Worker<PipelineJob>(
    LESSON_QUEUE,
    async (job) => {
      const data = job.data;
      logger.info({ jobId: job.id, stage: job.name, lessonId: data.lessonId }, "pipeline job started");
      switch (job.name) {
        case "extract":
          return processExtract(data);
        case "generate":
          return processGenerate(data);
        case "tts":
          return processTts(data);
        case "render":
          return processRender(data);
        default:
          throw new Error(`Unknown pipeline stage: ${job.name}`);
      }
    },
    {
      connection: getRedis(),
      concurrency: 2,
      lockDuration: 120_000,
      stalledInterval: 30_000,
    },
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id, stage: job.name, lessonId: job.data.lessonId }, "pipeline job completed");
  });

  worker.on("failed", async (job, error) => {
    if (!job) return;
    const maxAttempts = job.opts.attempts ?? env.GENERATION_MAX_ATTEMPTS;
    logger.error(
      { jobId: job.id, stage: job.name, lessonId: job.data.lessonId, attemptsMade: job.attemptsMade, maxAttempts, err: error },
      "pipeline job failed",
    );
    if (job.attemptsMade >= maxAttempts) {
      if (job.name === "tts" || job.name === "render") {
        const lesson = await prisma.lesson
          .findUnique({ where: { id: job.data.lessonId }, select: { sourceLocale: true } })
          .catch(() => null);
        const locale = job.data.locale ?? lesson?.sourceLocale ?? "el";
        await prisma.videoAsset
          .upsert({
            where: { lessonId_locale: { lessonId: job.data.lessonId, locale } },
            create: {
              lessonId: job.data.lessonId,
              locale,
              status: "FAILED",
              error: error.message.slice(0, 1000),
            },
            update: { status: "FAILED", error: error.message.slice(0, 1000) },
          })
          .catch((updateError) => logger.error({ err: updateError }, "could not mark video failed"));
        await prisma.lesson
          .updateMany({
            where: { id: job.data.lessonId, status: "RENDERING" },
            data: { status: "READY" },
          })
          .catch((updateError) => logger.error({ err: updateError }, "could not restore lesson status"));
        return;
      }

      await prisma.lesson
        .updateMany({
          where: { id: job.data.lessonId, status: { not: "CANCELLED" } },
          data: { status: "FAILED", failureReason: error.message.slice(0, 1000) },
        })
        .catch((updateError) => logger.error({ err: updateError }, "could not mark lesson failed"));
    }
  });

  return worker;
}

if (process.env.NODE_ENV !== "test" && process.env.WORKER_AUTOSTART !== "0") {
  const worker = createPipelineWorker();
  logger.info({ concurrency: 2 }, "lesson pipeline worker started");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "worker shutting down");
    await worker.close();
    await prisma.$disconnect();
    await getRedis().quit();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}
