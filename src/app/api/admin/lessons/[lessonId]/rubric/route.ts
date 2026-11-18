import { json, withAdmin } from "@/server/http";
import { getLessonRubric, updateLessonRubric } from "@/server/services/rubric";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ lessonId: string }> }) {
  return withAdmin(request, async () => {
    const { lessonId } = await context.params;
    const rubric = await getLessonRubric(lessonId);
    return json({ rubric });
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ lessonId: string }> }) {
  return withAdmin(
    request,
    async () => {
      const { lessonId } = await context.params;
      const rubric = await updateLessonRubric(lessonId, await request.json());
      return json({ rubric });
    },
    { mutation: true },
  );
}
