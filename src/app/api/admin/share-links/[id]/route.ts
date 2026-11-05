import { json, withAdmin } from "@/server/http";
import { revokeShareLink } from "@/server/services/share-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return withAdmin(
    request,
    async () => {
      const { id } = await context.params;
      const link = await revokeShareLink(id);
      return json({ link });
    },
    { mutation: true },
  );
}
