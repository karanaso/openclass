import { json, withAdmin } from "@/server/http";
import { updateQuestion } from "@/server/services/questions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ lessonId: string; questionId: string }> },
) {
  return withAdmin(
    request,
    async () => {
      const { lessonId, questionId } = await context.params;
      const question = await updateQuestion(lessonId, questionId, await request.json());
      return json({ question });
    },
    { mutation: true },
  );
}
