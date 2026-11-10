import { Worker } from "bullmq";
import { getEnv } from "../lib/env";
import { logger } from "../lib/logger";
import { prisma } from "../server/db";
import { LESSON_QUEUE, type PipelineJob } from "../server/queue";
import { getRedis } from "../server/redis";
import { processExtract } from "./processors/extract";
import { processGenerate } from "./processors/generate";
import { processNarration } from "./processors/narration";
import { processRender } from "./processors/render";
import { processStory } from "./processors/story";
import { processTts } from "./processors/tts";
import { processVideoPoll, processVideoSubmit } from "./processors/video";
import { processVisual } from "./processors/visual";
import { markMediaFailure, markStoryFailure } from "./failures";
import { resumeVideoJobs } from "@/server/video/resume";

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
        case "narration":
          return processNarration(data);
        case "story":
          return processStory(data);
        case "tts":
          return processTts(data);
        case "visual":
          return processVisual(data);
        case "video-submit":
          return processVideoSubmit(data);
        case "video-poll":
          return processVideoPoll(data);
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
      if (
        job.name === "narration" ||
        job.name === "story" ||
        job.name === "tts" ||
        job.name === "video-submit" ||
        job.name === "video-poll" ||
        job.name === "render"
      ) {
        await markMediaFailure(job.data, error).catch((updateError) =>
          logger.error({ err: updateError }, "could not mark video failed"),
        );
        if (job.name === "story") {
          await markStoryFailure(job.data, error).catch((updateError) =>
            logger.error({ err: updateError }, "could not mark story failed"),
          );
        }
        return;
      }

      if (job.name === "visual") {
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
  void resumeVideoJobs().catch((error) => logger.error({ err: error }, "could not resume pending video jobs"));
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
