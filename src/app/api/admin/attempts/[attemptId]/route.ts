import { json, withAdmin } from "@/server/http";
import { deleteAttempt } from "@/server/services/results";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: Request, context: { params: Promise<{ attemptId: string }> }) {
  return withAdmin(
    request,
    async () => {
      const { attemptId } = await context.params;
      return json(await deleteAttempt(attemptId));
    },
    { mutation: true },
  );
}
