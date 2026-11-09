import { z } from "zod";
import { withAdmin } from "@/server/http";
import { prisma } from "@/server/db";
import { AppError } from "@/lib/errors";
import { getStorage } from "@/server/storage";
import { serveStoredMedia } from "@/server/media/serve-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const kindSchema = z.enum(["scene", "character"]);

export async function GET(
  request: Request,
  context: { params: Promise<{ lessonId: string; kind: string }> },
) {
  return withAdmin(request, async () => {
    const { lessonId, kind } = await context.params;
    const parsedKind = kindSchema.parse(kind);

    const visual = await prisma.lessonVisual.findUnique({ where: { lessonId } });
    if (!visual || visual.status !== "READY") throw new AppError("not_found", "Artwork not found", 404);

    const key = parsedKind === "scene" ? visual.sceneKey : visual.characterSheetKey;
    if (!key) throw new AppError("not_found", "Artwork not found", 404);

    return serveStoredMedia(request, getStorage(), {
      key,
      contentType: "image/png",
      cacheControl: "private, max-age=60, must-revalidate",
      allowRange: false,
    });
  });
}
