import { json, withAdmin } from "@/server/http";
import { retryLesson } from "@/server/services/lesson-control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ lessonId: string }> }) {
  return withAdmin(
    request,
    async () => {
      const { lessonId } = await context.params;
      const lesson = await retryLesson(lessonId);
      return json({ lesson });
    },
    { mutation: true },
  );
}
