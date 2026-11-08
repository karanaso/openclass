import { Readable } from "node:stream";
import { AppError } from "@/lib/errors";
import type { LocalStorage } from "@/server/storage";

export const MEDIA_CONTENT_TYPES = {
  video: "video/mp4",
  captions: "text/vtt; charset=utf-8",
  poster: "image/jpeg",
} as const;

export type MediaKind = keyof typeof MEDIA_CONTENT_TYPES;

export type ServeMediaOptions = {
  key: string;
  contentType: string;
  cacheControl?: string;
  allowRange?: boolean;
};

export async function serveStoredMedia(
  request: Request,
  storage: LocalStorage,
  options: ServeMediaOptions,
): Promise<Response> {
  let stats: { size: number };
  try {
    stats = await storage.stat(options.key);
  } catch {
    throw new AppError("not_found", "Media not found", 404);
  }

  const headers: Record<string, string> = {
    "content-type": options.contentType,
    "accept-ranges": "bytes",
    "cache-control": options.cacheControl ?? "private, max-age=0, must-revalidate",
  };

  const range = options.allowRange === false ? null : request.headers.get("range");
  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match?.[1] ? Number(match[1]) : 0;
    const end = match?.[2] ? Math.min(Number(match[2]), stats.size - 1) : stats.size - 1;
    if (start > end || start >= stats.size) {
      return new Response(null, { status: 416, headers: { "content-range": `bytes */${stats.size}` } });
    }
    const nodeStream = storage.getStream(options.key, { start, end });
    return new Response(Readable.toWeb(nodeStream) as ReadableStream, {
      status: 206,
      headers: {
        ...headers,
        "content-range": `bytes ${start}-${end}/${stats.size}`,
        "content-length": String(end - start + 1),
      },
    });
  }

  return new Response(Readable.toWeb(storage.getStream(options.key)) as ReadableStream, {
    status: 200,
    headers: { ...headers, "content-length": String(stats.size) },
  });
}
