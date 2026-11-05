import { json, withAdmin } from "@/server/http";
import { getLessonDetail } from "@/server/services/classes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ lessonId: string }> }) {
  return withAdmin(request, async () => {
    const { lessonId } = await context.params;
    const lesson = await getLessonDetail(lessonId);
    return json({ lesson });
  });
}
