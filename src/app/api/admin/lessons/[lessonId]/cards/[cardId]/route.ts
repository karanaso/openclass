import { json, withAdmin } from "@/server/http";
import { updateCardTranslations } from "@/server/services/cards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ lessonId: string; cardId: string }> },
) {
  return withAdmin(
    request,
    async () => {
      const { lessonId, cardId } = await context.params;
      const card = await updateCardTranslations(lessonId, cardId, await request.json());
      return json({ card });
    },
    { mutation: true },
  );
}
