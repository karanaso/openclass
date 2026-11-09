import { randomUUID } from "node:crypto";
import { json, withAdmin } from "@/server/http";
import { prisma } from "@/server/db";
import { enqueueStage } from "@/server/queue";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ lessonId: string }> }) {
  return withAdmin(
    request,
    async () => {
      const { lessonId } = await context.params;
      const lesson = await prisma.lesson.findUnique({
        where: { id: lessonId },
        select: {
          id: true,
          status: true,
          jobVersion: true,
          visual: { select: { status: true } },
          jobs: { where: { stage: "VISUAL" }, select: { status: true } },
        },
      });
      if (!lesson) throw new AppError("not_found", "Lesson not found", 404);
      if (lesson.status === "CANCELLED") throw new AppError("cancelled", "Lesson was cancelled", 409);

      const visualJob = lesson.jobs[0];
      const busy =
        lesson.visual?.status === "PENDING" ||
        lesson.visual?.status === "GENERATING" ||
        visualJob?.status === "PENDING" ||
        visualJob?.status === "ACTIVE";
      if (busy) {
        throw new AppError("visual_processing", "Artwork is already being regenerated", 409);
      }

      await enqueueStage({
        lessonId,
        stage: "visual",
        version: lesson.jobVersion,
        runId: randomUUID(),
      });
      return json({ queued: true }, 202);
    },
    { mutation: true },
  );
}
