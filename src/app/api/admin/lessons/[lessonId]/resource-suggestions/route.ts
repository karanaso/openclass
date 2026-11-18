import { json, withAdmin } from "@/server/http";
import { suggestLessonResources } from "@/server/services/resource-suggestions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ lessonId: string }> }) {
  return withAdmin(
    request,
    async () => {
      const { lessonId } = await context.params;
      const result = await suggestLessonResources(lessonId);
      return json({ created: result.created, resources: result.resources });
    },
    { mutation: true },
  );
}
