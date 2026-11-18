import { json, withAdmin } from "@/server/http";
import { deleteResource, updateResource } from "@/server/services/resources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ lessonId: string; resourceId: string }> },
) {
  return withAdmin(
    request,
    async () => {
      const { lessonId, resourceId } = await context.params;
      const resource = await updateResource(lessonId, resourceId, await request.json());
      return json({ resource });
    },
    { mutation: true },
  );
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ lessonId: string; resourceId: string }> },
) {
  return withAdmin(
    request,
    async () => {
      const { lessonId, resourceId } = await context.params;
      await deleteResource(lessonId, resourceId);
      return json({ ok: true });
    },
    { mutation: true },
  );
}
