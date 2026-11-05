import { z } from "zod";
import { json, withPublic } from "@/server/http";
import { prisma } from "@/server/db";
import { assertLessonInShare, requireStudentContext } from "@/server/student/guard";
import { submitQuestionnaire } from "@/server/student/questionnaire";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  answers: z.array(z.object({ questionId: z.string().min(1), optionId: z.string().min(1) })),
  durationMs: z.number().int().min(0).max(24 * 60 * 60 * 1000),
  idempotencyKey: z.string().min(8).max(200),
  locale: z.enum(["el", "en"]),
});

export async function POST(request: Request, context: { params: Promise<{ token: string; lessonId: string }> }) {
  return withPublic(async () => {
    const { token, lessonId } = await context.params;
    const { share, session } = await requireStudentContext(request, token);
    assertLessonInShare(share, lessonId);
    const body = bodySchema.parse(await request.json());

    const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { sourceLocale: true, retakeEnabled: true, passThreshold: true } });
    if (!lesson) throw new AppError("not_found", "Lesson not found", 404);

    const outcome = await submitQuestionnaire({
      lessonId,
      studentName: session.name,
      normalizedStudentName: session.normalizedName,
      locale: body.locale,
      answers: body.answers,
      durationMs: body.durationMs,
      idempotencyKey: body.idempotencyKey,
      retakeEnabled: lesson.retakeEnabled,
      passThreshold: lesson.passThreshold,
    });

    return json({ blocked: outcome.blocked, result: outcome.result });
  });
}
