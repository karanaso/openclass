import { json, withAdmin } from "@/server/http";
import { listLessonsForClass } from "@/server/services/classes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ classId: string }> }) {
  return withAdmin(request, async () => {
    const { classId } = await context.params;
    const lessons = await listLessonsForClass(classId);
    return json({ lessons });
  });
}
