import { json, withPublic } from "@/server/http";
import { prisma } from "@/server/db";
import { assertLessonInShare, requireStudentContext } from "@/server/student/guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ token: string; lessonId: string }> }) {
  return withPublic(async () => {
    const { token, lessonId } = await context.params;
    const { share, session } = await requireStudentContext(request, token);
    assertLessonInShare(share, lessonId);

    await prisma.deckView.upsert({
      where: {
        lessonId_normalizedStudentName: { lessonId, normalizedStudentName: session.normalizedName },
      },
      create: { lessonId, normalizedStudentName: session.normalizedName },
      update: { completedAt: new Date() },
    });
    return json({ ok: true });
  });
}
