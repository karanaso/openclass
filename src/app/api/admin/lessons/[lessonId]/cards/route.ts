import { json, withAdmin } from "@/server/http";
import { createCard } from "@/server/services/cards";

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
      const card = await createCard(lessonId, await request.json());
      return json({ card }, 201);
    },
    { mutation: true },
  );
}
