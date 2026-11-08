import { json, withAdmin } from "@/server/http";
import { createQuestion } from "@/server/services/questions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ lessonId: string }> },
) {
  return withAdmin(
    request,
    async () => {
      const { lessonId } = await context.params;
      const question = await createQuestion(lessonId, await request.json());
      return json({ question }, 201);
    },
    { mutation: true },
  );
}
