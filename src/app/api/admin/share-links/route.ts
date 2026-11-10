import { z } from "zod";
import { json, withAdmin } from "@/server/http";
import { createShareLink, listShareLinks } from "@/server/services/share-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  classId: z.string().optional(),
  lessonId: z.string().optional(),
});

export async function GET(request: Request) {
  return withAdmin(request, async () => {
    const url = new URL(request.url);
    const parsed = querySchema.parse({
      classId: url.searchParams.get("classId") ?? undefined,
      lessonId: url.searchParams.get("lessonId") ?? undefined,
    });
    const links = await listShareLinks(parsed);
    return json({ links });
  });
}

export async function POST(request: Request) {
  return withAdmin(
    request,
    async () => {
      const { link, token } = await createShareLink(await request.json());
      return json({ link, token }, 201);
    },
    { mutation: true },
  );
}
