import { json, withAdmin } from "@/server/http";
import { createManualResource } from "@/server/services/resources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ lessonId: string }> },
) {
  return withAdmin(
    request,
    async () => {
      const { lessonId } = await context.params;
      const resource = await createManualResource(lessonId, await request.json());
      return json({ resource }, 201);
    },
    { mutation: true },
  );
}
