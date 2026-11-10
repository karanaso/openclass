import { mkdtemp, rm, statfs, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { probeDurationMs } from "@/server/media/ffmpeg";
import type { LocalStorage } from "@/server/storage";
import type { VideoLocale, VideoProvider, VideoProviderJob } from "./provider";

export type IngestedVideo = {
  videoKey: string;
  captionsKey: string | null;
  posterKey: string | null;
  durationMs: number;
  sizeBytes: number;
};

const FREE_DISK_MIN_BYTES = 512 * 1024 * 1024;

function looksLikeVideo(contentType: string | null, url: string): boolean {
  return Boolean(contentType?.toLowerCase().startsWith("video/")) || /\.mp4(?:$|[?#])/i.test(url);
}

function looksLikeCaptions(contentType: string | null, url: string): boolean {
  return Boolean(contentType?.toLowerCase().startsWith("text/")) || /\.vtt(?:$|[?#])/i.test(url);
}

function looksLikeImage(contentType: string | null, url: string): boolean {
  return Boolean(contentType?.toLowerCase().startsWith("image/")) || /\.(?:jpe?g|png)(?:$|[?#])/i.test(url);
}

async function optionalOutput(input: {
  provider: VideoProvider;
  url: string | undefined;
  label: "captions" | "poster";
  maxBytes: number;
  validate: (contentType: string | null, url: string) => boolean;
}): Promise<Uint8Array | null> {
  if (!input.url) return null;
  try {
    const download = await input.provider.download(input.url);
    if (
      download.body.byteLength === 0 ||
      download.body.byteLength > input.maxBytes ||
      !input.validate(download.contentType, input.url)
    ) {
      throw new Error(`${input.label} output is empty, too large, or has the wrong content type`);
    }
    return download.body;
  } catch (error) {
    logger.warn({ label: input.label, err: error }, "optional provider output unavailable");
    return null;
  }
}

export async function ingestVideoOutput(input: {
  lessonId: string;
  locale: VideoLocale;
  job: VideoProviderJob;
  provider: VideoProvider;
  storage: LocalStorage;
}): Promise<IngestedVideo> {
  const env = getEnv();
  const outputs = input.job.outputs;
  if (!outputs?.videoUrl) {
    throw new AppError("invalid_video_output", "Video provider completed without a video URL", 422);
  }
  if (input.job.durationSeconds && input.job.durationSeconds > env.MAX_VIDEO_SECONDS) {
    throw new AppError(
      "video_too_long",
      `Video would exceed the ${env.MAX_VIDEO_SECONDS}-second limit`,
      422,
    );
  }

  const disk = await statfs(input.storage.getRoot());
  const freeBytes = Number(disk.bavail) * Number(disk.bsize);
  if (freeBytes < FREE_DISK_MIN_BYTES) {
    throw new AppError("insufficient_disk", "Not enough free disk space to store the video", 507);
  }

  const download = await input.provider.download(outputs.videoUrl);
  if (
    download.body.byteLength === 0 ||
    download.body.byteLength > env.VIDEO_MAX_OUTPUT_BYTES ||
    !looksLikeVideo(download.contentType, outputs.videoUrl)
  ) {
    throw new AppError("invalid_video_output", "Downloaded video is empty, too large, or not a video", 422);
  }

  const workDir = await mkdtemp(path.join(os.tmpdir(), "lessonlab-provider-video-"));
  try {
    const videoPath = path.join(workDir, "video.mp4");
    await writeFile(videoPath, download.body);
    const durationMs = await probeDurationMs(videoPath);
    if (durationMs > env.MAX_VIDEO_SECONDS * 1000) {
      throw new AppError(
        "video_too_long",
        `Video would exceed the ${env.MAX_VIDEO_SECONDS}-second limit`,
        422,
      );
    }

    const videoKey = `lessons/${input.lessonId}/video/${input.locale}.mp4`;
    await input.storage.putFile(videoKey, videoPath);

    const captions = await optionalOutput({
      provider: input.provider,
      url: outputs.captionsUrl,
      label: "captions",
      maxBytes: env.VIDEO_MAX_OUTPUT_BYTES,
      validate: looksLikeCaptions,
    });
    const captionsKey = captions ? `lessons/${input.lessonId}/video/${input.locale}.vtt` : null;
    if (captions && captionsKey) {
      await input.storage.put(captionsKey, captions);
    }

    const poster = await optionalOutput({
      provider: input.provider,
      url: outputs.posterUrl,
      label: "poster",
      maxBytes: env.VIDEO_MAX_OUTPUT_BYTES,
      validate: looksLikeImage,
    });
    const posterKey = poster ? `lessons/${input.lessonId}/video/${input.locale}.jpg` : null;
    if (poster && posterKey) {
      await input.storage.put(posterKey, poster);
    }

    return {
      videoKey,
      captionsKey,
      posterKey,
      durationMs,
      sizeBytes: download.body.byteLength,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
