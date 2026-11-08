import { z } from "zod";
import { withAdmin } from "@/server/http";
import { prisma } from "@/server/db";
import { AppError } from "@/lib/errors";
import { getStorage } from "@/server/storage";
import { MEDIA_CONTENT_TYPES, serveStoredMedia } from "@/server/media/serve-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const localeSchema = z.enum(["el", "en"]);
const kindSchema = z.enum(["video", "captions", "poster"]);

export async function GET(
  request: Request,
  context: { params: Promise<{ lessonId: string; locale: string; kind: string }> },
) {
  return withAdmin(request, async () => {
    const { lessonId, locale, kind } = await context.params;
    const parsedLocale = localeSchema.parse(locale);
    const parsedKind = kindSchema.parse(kind);

    const video = await prisma.videoAsset.findUnique({
      where: { lessonId_locale: { lessonId, locale: parsedLocale } },
    });
    if (!video || video.status !== "READY") throw new AppError("not_found", "Video not found", 404);

    const key =
      parsedKind === "video" ? video.storageKey : parsedKind === "captions" ? video.captionsKey : video.posterKey;
    if (!key) throw new AppError("not_found", "Media not found", 404);

    return serveStoredMedia(request, getStorage(), {
      key,
      contentType: MEDIA_CONTENT_TYPES[parsedKind],
    });
  });
}
