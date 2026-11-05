import { json, withAdmin } from "@/server/http";
import { getClassResults } from "@/server/services/results";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ classId: string }> }) {
  return withAdmin(request, async () => {
    const { classId } = await context.params;
    return json({ results: await getClassResults(classId) });
  });
}
