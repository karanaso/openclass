import { z } from "zod";
import { json, withPublic } from "@/server/http";
import { assertLessonInShare, requireStudentContext } from "@/server/student/guard";
import { startGame } from "@/server/student/game";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ locale: z.enum(["el", "en"]).default("el") });

export async function POST(request: Request, context: { params: Promise<{ token: string; lessonId: string }> }) {
  return withPublic(async () => {
    const { token, lessonId } = await context.params;
    const { share, session } = await requireStudentContext(request, token);
    assertLessonInShare(share, lessonId);
    const body = bodySchema.parse(await request.json().catch(() => ({})));

    const state = await startGame({
      lessonId,
      studentName: session.name,
      normalizedStudentName: session.normalizedName,
      locale: body.locale,
    });
    return json({ state });
  });
}
