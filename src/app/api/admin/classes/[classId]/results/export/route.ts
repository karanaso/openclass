import { withAdmin } from "@/server/http";
import { exportClassCsv } from "@/server/services/results";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ classId: string }> }) {
  return withAdmin(request, async () => {
    const { classId } = await context.params;
    const csv = await exportClassCsv(classId);
    return new Response(`\uFEFF${csv}`, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="class-${classId}-results.csv"`,
        "cache-control": "no-store",
      },
    });
  });
}
