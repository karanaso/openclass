import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { logger } from "@/lib/logger";
import { prisma as defaultPrisma } from "@/server/db";
import { enqueueStage } from "@/server/queue";

export async function resumeVideoJobs(db: PrismaClient = defaultPrisma): Promise<number> {
  const videos = await db.videoAsset.findMany({
    where: { status: { in: ["PENDING", "RENDERING"] } },
    include: { lesson: { select: { id: true, jobVersion: true, status: true } } },
  });

  let resumed = 0;
  for (const video of videos) {
    if (video.lesson.status === "CANCELLED") continue;
    try {
      if (video.status === "RENDERING" && video.providerJobId) {
        await enqueueStage({
          lessonId: video.lessonId,
          stage: "video-poll",
          version: video.lesson.jobVersion,
          locale: video.locale as "el" | "en",
          runId: randomUUID(),
        });
      } else {
        await enqueueStage({
          lessonId: video.lessonId,
          stage: "story",
          version: video.lesson.jobVersion,
          locale: video.locale as "el" | "en",
          runId: randomUUID(),
        });
      }
      resumed += 1;
    } catch (error) {
      logger.warn({ lessonId: video.lessonId, locale: video.locale, err: error }, "could not resume video job");
    }
  }
  return resumed;
}
