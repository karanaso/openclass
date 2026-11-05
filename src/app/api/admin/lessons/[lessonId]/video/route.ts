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
        include: { narration: { where: { locale: body.locale }, select: { id: true } } },
      });
      if (!lesson) throw new AppError("not_found", "Lesson not found", 404);
      if (lesson.status === "CANCELLED") throw new AppError("cancelled", "Lesson was cancelled", 409);
      if (lesson.narration.length === 0) {
        throw new AppError("no_narration", `No narration is available for ${body.locale}`, 422);
      }

      await enqueueStage({ lessonId, stage: "tts", version: lesson.jobVersion, locale: body.locale });
      return json({ queued: true, locale: body.locale }, 202);
    },
    { mutation: true },
  );
}
