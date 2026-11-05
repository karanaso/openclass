import { withAdmin } from "@/server/http";
import { exportLessonCsv } from "@/server/services/results";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ lessonId: string }> }) {
  return withAdmin(request, async () => {
    const { lessonId } = await context.params;
    const csv = await exportLessonCsv(lessonId);
    return new Response(`\uFEFF${csv}`, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="lesson-${lessonId}-results.csv"`,
        "cache-control": "no-store",
      },
    });
  });
}
