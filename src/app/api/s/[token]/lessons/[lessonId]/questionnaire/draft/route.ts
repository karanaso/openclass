import { z } from "zod";
import { json, withPublic } from "@/server/http";
import { prisma } from "@/server/db";
import { assertLessonInShare, requireStudentContext } from "@/server/student/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  answers: z.record(z.string(), z.string()).default({}),
  locale: z.enum(["el", "en"]).default("el"),
});

export async function POST(request: Request, context: { params: Promise<{ token: string; lessonId: string }> }) {
  return withPublic(async () => {
    const { token, lessonId } = await context.params;
    const { share, session } = await requireStudentContext(request, token);
    assertLessonInShare(share, lessonId);
    const body = bodySchema.parse(await request.json());

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.attemptDraft.upsert({
      where: {
        lessonId_normalizedStudentName: { lessonId, normalizedStudentName: session.normalizedName },
      },
      create: {
        lessonId,
        normalizedStudentName: session.normalizedName,
        locale: body.locale,
        answers: body.answers,
        expiresAt,
      },
      update: { answers: body.answers, expiresAt },
    });

    return json({ ok: true });
  });
}
