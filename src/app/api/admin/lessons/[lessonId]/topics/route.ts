import { json, withAdmin } from "@/server/http";
import { getLessonTopics, updateLessonTopics } from "@/server/services/topics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ lessonId: string }> }) {
  return withAdmin(request, async () => {
    const { lessonId } = await context.params;
    const topics = await getLessonTopics(lessonId);
    return json({ topics });
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ lessonId: string }> }) {
  return withAdmin(
    request,
    async () => {
      const { lessonId } = await context.params;
      const topics = await updateLessonTopics(lessonId, await request.json());
      return json({ topics });
    },
    { mutation: true },
  );
}
