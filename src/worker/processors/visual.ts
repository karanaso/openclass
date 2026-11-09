import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/server/db";
import { ensureLessonVisual } from "@/server/media/lesson-visual";
import type { ArtDirectionProvider } from "@/server/media/art-direction";
import type { ImageProvider } from "@/server/media/image";
import { enqueueStage, type PipelineJob } from "@/server/queue";
import { getStorage, type LocalStorage } from "@/server/storage";

export async function processVisual(
  data: PipelineJob,
  options: {
    db?: PrismaClient;
    storage?: LocalStorage;
    imageProvider?: ImageProvider | null;
    artDirectionProvider?: ArtDirectionProvider | null;
    enqueue?: boolean;
  } = {},
): Promise<void> {
  const db = options.db ?? defaultPrisma;
  const storage = options.storage ?? getStorage();
  const lesson = await db.lesson.findUnique({
    where: { id: data.lessonId },
    include: { pages: { orderBy: { pageNumber: "asc" } } },
  });
  if (!lesson || lesson.status === "CANCELLED") return;

  const assets = await ensureLessonVisual(
    { id: lesson.id, title: lesson.title, jobVersion: lesson.jobVersion, pages: lesson.pages },
    {
      db,
      storage,
      provider: options.imageProvider,
      artDirectionProvider: options.artDirectionProvider,
      force: true,
    },
  );
  if (!assets || options.enqueue === false) return;

  const videos = await db.videoAsset.findMany({
    where: { lessonId: lesson.id, status: { in: ["READY", "FAILED", "SKIPPED"] } },
    select: { locale: true },
  });
  for (const video of videos) {
    await enqueueStage({
      lessonId: lesson.id,
      stage: "render",
      version: lesson.jobVersion,
      locale: video.locale as "el" | "en",
      runId: randomUUID(),
    });
  }
}
