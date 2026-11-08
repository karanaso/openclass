import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";

const execFileAsync = promisify(execFile);

export async function runFfmpeg(args: string[], timeoutMs?: number): Promise<void> {
  const env = getEnv();
  try {
    await execFileAsync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], {
      timeout: timeoutMs ?? env.VIDEO_RENDER_TIMEOUT_MS,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    throw new AppError(
      "ffmpeg_failed",
      `Video rendering failed: ${error instanceof Error ? error.message.slice(0, 300) : "unknown error"}`,
      500,
    );
  }
}

export async function probeDurationMs(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath],
      { timeout: 30_000 },
    );
    const seconds = Number(stdout.trim());
    if (!Number.isFinite(seconds) || seconds <= 0) {
      throw new Error("invalid duration");
    }
    return Math.round(seconds * 1000);
  } catch (error) {
    throw new AppError(
      "ffprobe_failed",
      `Could not measure audio duration: ${error instanceof Error ? error.message.slice(0, 200) : "unknown error"}`,
      500,
    );
  }
}

export type ImageInfo = {
  width: number;
  height: number;
  pixFmt: string;
};

export async function probeImageInfo(filePath: string): Promise<ImageInfo> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,pix_fmt", "-of", "json", filePath],
      { timeout: 30_000 },
    );
    const parsed = JSON.parse(stdout) as { streams?: Array<{ width?: number; height?: number; pix_fmt?: string }> };
    const stream = parsed.streams?.[0];
    if (!stream?.width || !stream.height || !stream.pix_fmt) throw new Error("missing image metadata");
    return { width: stream.width, height: stream.height, pixFmt: stream.pix_fmt };
  } catch (error) {
    throw new AppError(
      "ffprobe_failed",
      `Could not read image dimensions: ${error instanceof Error ? error.message.slice(0, 200) : "unknown error"}`,
      500,
    );
  }
}

export async function renderPdfPageImages(
  pdfPath: string,
  outputDirectory: string,
  options: { maxPages?: number; width?: number; prefix?: string } = {},
): Promise<number> {
  const env = getEnv();
  const prefix = options.prefix ?? "page";
  const width = options.width ?? 1920;
  const maxPages = options.maxPages ?? env.MAX_PDF_PAGES;
  await mkdir(outputDirectory, { recursive: true });

  try {
    await execFileAsync(
      "pdftoppm",
      [
        "-png",
        "-r",
        "150",
        "-scale-to-x",
        String(width),
        "-scale-to-y",
        "-1",
        "-f",
        "1",
        "-l",
        String(maxPages),
        pdfPath,
        path.join(outputDirectory, prefix),
      ],
      { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 },
    );
  } catch (error) {
    throw new AppError(
      "pdf_render_failed",
      `Could not render PDF pages: ${error instanceof Error ? error.message.slice(0, 300) : "unknown error"}`,
      500,
    );
  }

  return maxPages;
}
