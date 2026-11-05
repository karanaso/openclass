import { z } from "zod";
import { json, withPublic } from "@/server/http";
import { assertLessonInShare, requireStudentContext } from "@/server/student/guard";
import { consumeLifeline } from "@/server/student/game";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  attemptId: z.string().min(1),
  lifeline: z.enum(["fiftyFifty", "askAudience"]),
  locale: z.enum(["el", "en"]).default("el"),
});

export async function POST(request: Request, context: { params: Promise<{ token: string; lessonId: string }> }) {
  return withPublic(async () => {
    const { token, lessonId } = await context.params;
    const { share, session } = await requireStudentContext(request, token);
    assertLessonInShare(share, lessonId);
    const body = bodySchema.parse(await request.json());

    const result = await consumeLifeline({
      attemptId: body.attemptId,
      lessonId,
      normalizedStudentName: session.normalizedName,
      lifeline: body.lifeline,
      locale: body.locale,
    });
    return json(result);
  });
}
