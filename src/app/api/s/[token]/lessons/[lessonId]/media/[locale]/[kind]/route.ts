import { Readable } from "node:stream";
import { z } from "zod";
import { withPublic } from "@/server/http";
import { prisma } from "@/server/db";
import { AppError } from "@/lib/errors";
import { assertLessonInShare, requireStudentContext } from "@/server/student/guard";
import { getStorage } from "@/server/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const kindSchema = z.enum(["video", "captions", "poster"]);
const contentTypes = {
  video: "video/mp4",
  captions: "text/vtt; charset=utf-8",
  poster: "image/jpeg",
} as const;

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string; lessonId: string; locale: string; kind: string }> },
) {
  return withPublic(async () => {
    const { token, lessonId, locale, kind } = await context.params;
    const { share } = await requireStudentContext(request, token);
    assertLessonInShare(share, lessonId);
    const parsedKind = kindSchema.parse(kind);

    const video = await prisma.videoAsset.findUnique({
      where: { lessonId_locale: { lessonId, locale } },
    });
    if (!video || video.status !== "READY") throw new AppError("not_found", "Video not found", 404);

    const key = parsedKind === "video" ? video.storageKey : parsedKind === "captions" ? video.captionsKey : video.posterKey;
    if (!key) throw new AppError("not_found", "Media not found", 404);

    const storage = getStorage();
    const stats = await storage.stat(key);
    const range = request.headers.get("range");

    const headers: Record<string, string> = {
      "content-type": contentTypes[parsedKind],
      "accept-ranges": "bytes",
      "cache-control": "private, max-age=0, must-revalidate",
    };

    if (parsedKind === "video" && range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      const start = match?.[1] ? Number(match[1]) : 0;
      const end = match?.[2] ? Math.min(Number(match[2]), stats.size - 1) : stats.size - 1;
      if (start > end || start >= stats.size) {
        return new Response(null, { status: 416, headers: { "content-range": `bytes */${stats.size}` } });
      }
      const nodeStream = storage.getStream(key, { start, end });
      return new Response(Readable.toWeb(nodeStream) as ReadableStream, {
        status: 206,
        headers: {
          ...headers,
          "content-range": `bytes ${start}-${end}/${stats.size}`,
          "content-length": String(end - start + 1),
        },
      });
    }

    return new Response(Readable.toWeb(storage.getStream(key)) as ReadableStream, {
      status: 200,
      headers: { ...headers, "content-length": String(stats.size) },
    });
  });
}
