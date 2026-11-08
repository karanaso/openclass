import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError } from "@/lib/errors";
import { probeImageInfo, runFfmpeg } from "./ffmpeg";

export const CHARACTER_SHEET_SIZE = 1024;
export const CHARACTER_CELL_SIZE = CHARACTER_SHEET_SIZE / 2;

export type PoseFrames = {
  neutral: string;
  blink: string;
  wave: string;
  idle: string;
};

const POSE_LAYOUT: Array<{ pose: keyof PoseFrames; x: number; y: number }> = [
  { pose: "neutral", x: 0, y: 0 },
  { pose: "blink", x: CHARACTER_CELL_SIZE, y: 0 },
  { pose: "wave", x: 0, y: CHARACTER_CELL_SIZE },
  { pose: "idle", x: CHARACTER_CELL_SIZE, y: CHARACTER_CELL_SIZE },
];

const LOOP_SEQUENCE: Array<{ pose: keyof PoseFrames; seconds: number }> = [
  { pose: "neutral", seconds: 2 },
  { pose: "blink", seconds: 0.15 },
  { pose: "neutral", seconds: 1 },
  { pose: "wave", seconds: 1.5 },
  { pose: "idle", seconds: 1 },
  { pose: "neutral", seconds: 0.35 },
];

export const CHARACTER_LOOP_SECONDS = LOOP_SEQUENCE.reduce((sum, frame) => sum + frame.seconds, 0);
export const CHARACTER_LOOP_FPS = 30;

function hasAlphaChannel(pixFmt: string): boolean {
  return pixFmt.includes("a") || pixFmt === "pal8";
}

export async function validateSpriteSheet(sheetPath: string): Promise<{ cellSize: number }> {
  const info = await probeImageInfo(sheetPath);
  if (info.width !== CHARACTER_SHEET_SIZE || info.height !== CHARACTER_SHEET_SIZE) {
    throw new AppError(
      "invalid_sprite_sheet",
      `Character sheet must be ${CHARACTER_SHEET_SIZE}x${CHARACTER_SHEET_SIZE}, got ${info.width}x${info.height}`,
      422,
    );
  }
  if (!hasAlphaChannel(info.pixFmt)) {
    throw new AppError(
      "invalid_sprite_sheet",
      `Character sheet must have a transparent background (pixel format ${info.pixFmt})`,
      422,
    );
  }
  return { cellSize: CHARACTER_CELL_SIZE };
}

export async function sliceSpriteSheet(sheetPath: string, outputDirectory: string): Promise<PoseFrames> {
  await validateSpriteSheet(sheetPath);
  await mkdir(outputDirectory, { recursive: true });

  const frames = {} as PoseFrames;
  for (const { pose, x, y } of POSE_LAYOUT) {
    const outputPath = path.join(outputDirectory, `pose-${pose}.png`);
    await runFfmpeg([
      "-i",
      sheetPath,
      "-vf",
      `crop=${CHARACTER_CELL_SIZE}:${CHARACTER_CELL_SIZE}:${x}:${y}`,
      "-frames:v",
      "1",
      "-pix_fmt",
      "rgba",
      outputPath,
    ]);
    frames[pose] = outputPath;
  }
  return frames;
}

async function encodeLoop(
  frames: PoseFrames,
  listPath: string,
  outputPath: string,
  codec: "vp9" | "png",
): Promise<void> {
  const list = LOOP_SEQUENCE.map(
    (frame) => `file '${frames[frame.pose].replace(/'/g, "'\\''")}'\nduration ${frame.seconds}`,
  ).join("\n");
  await writeFile(listPath, list, "utf8");

  const args =
    codec === "vp9"
      ? [
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          listPath,
          "-vf",
          `fps=${CHARACTER_LOOP_FPS},format=yuva420p`,
          "-c:v",
          "libvpx-vp9",
          "-b:v",
          "0",
          "-crf",
          "30",
          "-auto-alt-ref",
          "0",
          "-pix_fmt",
          "yuva420p",
          "-t",
          CHARACTER_LOOP_SECONDS.toFixed(3),
          outputPath,
        ]
      : [
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          listPath,
          "-vf",
          `fps=${CHARACTER_LOOP_FPS},format=rgba`,
          "-c:v",
          "png",
          "-pix_fmt",
          "rgba",
          "-t",
          CHARACTER_LOOP_SECONDS.toFixed(3),
          outputPath,
        ];
  await runFfmpeg(args);
}

export async function renderCharacterLoop(
  frames: PoseFrames,
  outputDirectory: string,
): Promise<{ path: string; extension: "webm" | "mov" }> {
  await mkdir(outputDirectory, { recursive: true });
  const listPath = path.join(outputDirectory, "character-loop.txt");

  const webmPath = path.join(outputDirectory, "character-loop.webm");
  try {
    await encodeLoop(frames, listPath, webmPath, "vp9");
    return { path: webmPath, extension: "webm" };
  } catch {
    const movPath = path.join(outputDirectory, "character-loop.mov");
    try {
      await encodeLoop(frames, listPath, movPath, "png");
      return { path: movPath, extension: "mov" };
    } catch (error) {
      throw new AppError(
        "character_loop_failed",
        `Could not encode the character animation: ${error instanceof Error ? error.message.slice(0, 200) : "unknown error"}`,
        500,
      );
    }
  }
}
