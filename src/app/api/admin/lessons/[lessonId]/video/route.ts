import { randomUUID } from "node:crypto";
import { z } from "zod";
import { json, withAdmin } from "@/server/http";
import { prisma } from "@/server/db";
import { enqueueStage } from "@/server/queue";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ locale: z.enum(["el", "en"]) });

export async function POST(request: Request, context: { params: Promise<{ lessonId: string }> }) {
  return withAdmin(
    request,
    async () => {
      const { lessonId } = await context.params;
      const body = bodySchema.parse(await request.json());
      const lesson = await prisma.lesson.findUnique({
        where: { id: lessonId },
        include: {
          videos: { where: { locale: body.locale }, select: { status: true } },
          _count: { select: { pages: true } },
        },
      });
      if (!lesson) throw new AppError("not_found", "Lesson not found", 404);
      if (lesson.status === "CANCELLED") throw new AppError("cancelled", "Lesson was cancelled", 409);
      if (lesson._count.pages === 0) {
        throw new AppError("no_pages", "This lesson has no pages to narrate", 422);
      }

      const current = lesson.videos[0];
      if (current?.status === "PENDING" || current?.status === "RENDERING") {
        throw new AppError("video_processing", "This video variant is already processing", 409);
      }

      await prisma.videoAsset.upsert({
        where: { lessonId_locale: { lessonId, locale: body.locale } },
        create: { lessonId, locale: body.locale, status: "PENDING" },
        update: { status: "PENDING", error: null },
      });

      try {
        await enqueueStage({
          lessonId,
          stage: "narration",
          version: lesson.jobVersion,
          locale: body.locale,
          runId: randomUUID(),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 1000) : "Could not queue narration";
        await prisma.videoAsset
          .update({
            where: { lessonId_locale: { lessonId, locale: body.locale } },
            data: { status: "FAILED", error: message },
          })
          .catch(() => undefined);
        throw error;
      }

      return json({ queued: true, locale: body.locale }, 202);
    },
    { mutation: true },
  );
}
