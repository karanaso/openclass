import { json, withAdmin } from "@/server/http";
import { getLessonDetail, updateLessonTitle } from "@/server/services/classes";
import { deleteLesson } from "@/server/services/lesson-control";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ lessonId: string }> }) {
  return withAdmin(request, async () => {
    const { lessonId } = await context.params;
    const lesson = await getLessonDetail(lessonId);
    return json({ lesson });
  });
}

export async function PATCH(request: Request, context: { params: Promise<{ lessonId: string }> }) {
  return withAdmin(
    request,
    async () => {
      const { lessonId } = await context.params;
      const lesson = await updateLessonTitle(lessonId, await request.json());
      return json({ lesson });
    },
    { mutation: true },
  );
}

export async function DELETE(request: Request, context: { params: Promise<{ lessonId: string }> }) {
  return withAdmin(
    request,
    async () => {
      const { lessonId } = await context.params;
      const result = await deleteLesson(lessonId);
      return json(result);
    },
    { mutation: true },
  );
}
