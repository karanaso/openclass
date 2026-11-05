import { json, withAdmin } from "@/server/http";
import { getLessonResults } from "@/server/services/results";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ lessonId: string }> }) {
  return withAdmin(request, async () => {
    const { lessonId } = await context.params;
    return json({ results: await getLessonResults(lessonId) });
  });
}
