import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { AppError } from "@/lib/errors";
import { probeImageInfo, runFfmpeg } from "./ffmpeg";

const execFileAsync = promisify(execFile);

export const CHARACTER_SHEET_WIDTH = 1536;
export const CHARACTER_SHEET_HEIGHT = 1024;
export const CHARACTER_CELL_SIZE = 512;

export const MIN_CELL_ALPHA_COVERAGE = 0.03;
export const MAX_CELL_ALPHA_COVERAGE = 0.75;
export const MAX_CELL_SCALE_DEVIATION = 0.15;
export const MAX_CELL_BASELINE_DEVIATION = 0.05;

export type PoseName = "neutral" | "blink" | "talkClosed" | "talkOpen" | "wave" | "lean";

export type PoseFrames = Record<PoseName, string>;

const POSE_LAYOUT: Array<{ pose: PoseName; x: number; y: number }> = [
  { pose: "neutral", x: 0, y: 0 },
  { pose: "blink", x: CHARACTER_CELL_SIZE, y: 0 },
  { pose: "talkClosed", x: CHARACTER_CELL_SIZE * 2, y: 0 },
  { pose: "talkOpen", x: 0, y: CHARACTER_CELL_SIZE },
  { pose: "wave", x: CHARACTER_CELL_SIZE, y: CHARACTER_CELL_SIZE },
  { pose: "lean", x: CHARACTER_CELL_SIZE * 2, y: CHARACTER_CELL_SIZE },
];

const LOOP_SEQUENCE: Array<{ pose: PoseName; seconds: number }> = [
  { pose: "neutral", seconds: 1.2 },
  { pose: "blink", seconds: 0.15 },
  { pose: "neutral", seconds: 0.5 },
  { pose: "talkClosed", seconds: 0.25 },
  { pose: "talkOpen", seconds: 0.25 },
  { pose: "talkClosed", seconds: 0.25 },
  { pose: "talkOpen", seconds: 0.25 },
  { pose: "blink", seconds: 0.15 },
  { pose: "talkClosed", seconds: 0.25 },
  { pose: "talkOpen", seconds: 0.25 },
  { pose: "wave", seconds: 1.2 },
  { pose: "lean", seconds: 0.8 },
  { pose: "neutral", seconds: 0.5 },
];

export const CHARACTER_LOOP_SECONDS = LOOP_SEQUENCE.reduce((sum, frame) => sum + frame.seconds, 0);
export const CHARACTER_LOOP_FPS = 30;
export const CHARACTER_LOOP_POSES = [...new Set(LOOP_SEQUENCE.map((frame) => frame.pose))];

export type CellMetrics = {
  pose: PoseName;
  coverage: number;
  width: number;
  height: number;
  bottom: number;
};

function hasAlphaChannel(pixFmt: string): boolean {
  return pixFmt.includes("a") || pixFmt === "pal8";
}

function poseFileName(pose: PoseName): string {
  return `pose-${pose.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}.png`;
}

async function inspectCell(sheetPath: string, pose: PoseName, x: number, y: number): Promise<CellMetrics> {
  let stderr: string;
  try {
    const result = await execFileAsync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "info",
        "-i",
        sheetPath,
        "-vf",
        `crop=${CHARACTER_CELL_SIZE}:${CHARACTER_CELL_SIZE}:${x}:${y},alphaextract,signalstats,metadata=print:key=lavfi.signalstats.YAVG,bbox`,
        "-frames:v",
        "1",
        "-f",
        "null",
        "-",
      ],
      { timeout: 30_000, maxBuffer: 10 * 1024 * 1024 },
    );
    stderr = result.stderr;
  } catch (error) {
    throw new AppError(
      "invalid_sprite_sheet",
      `Could not inspect the character sheet: ${error instanceof Error ? error.message.slice(0, 200) : "unknown error"}`,
      422,
    );
  }

  const average = /lavfi\.signalstats\.YAVG=([0-9.]+)/.exec(stderr);
  const box = /x1:(\d+)\s+x2:(\d+)\s+y1:(\d+)\s+y2:(\d+)\s+w:(\d+)\s+h:(\d+)/.exec(stderr);
  if (!average || !box) {
    throw new AppError(
      "invalid_sprite_sheet",
      `The ${pose} cell contains no visible character`,
      422,
    );
  }

  return {
    pose,
    coverage: Number(average[1]) / 255,
    width: Number(box[5]),
    height: Number(box[6]),
    bottom: Number(box[4]),
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export async function inspectSpriteCells(sheetPath: string): Promise<CellMetrics[]> {
  return Promise.all(POSE_LAYOUT.map(({ pose, x, y }) => inspectCell(sheetPath, pose, x, y)));
}

export async function validateSpriteSheet(sheetPath: string): Promise<{ cellSize: number }> {
  const info = await probeImageInfo(sheetPath);
  if (info.width !== CHARACTER_SHEET_WIDTH || info.height !== CHARACTER_SHEET_HEIGHT) {
    throw new AppError(
      "invalid_sprite_sheet",
      `Character sheet must be ${CHARACTER_SHEET_WIDTH}x${CHARACTER_SHEET_HEIGHT}, got ${info.width}x${info.height}`,
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

  const cells = await inspectSpriteCells(sheetPath);
  for (const cell of cells) {
    if (
      cell.coverage < MIN_CELL_ALPHA_COVERAGE ||
      cell.coverage > MAX_CELL_ALPHA_COVERAGE ||
      cell.width <= 0 ||
      cell.height <= 0
    ) {
      throw new AppError(
        "invalid_sprite_sheet",
        `The ${cell.pose} cell must contain a visible character on a transparent background`,
        422,
      );
    }
  }

  const medianWidth = median(cells.map((cell) => cell.width));
  const medianHeight = median(cells.map((cell) => cell.height));
  const medianBottom = median(cells.map((cell) => cell.bottom));
  const baselineTolerance = CHARACTER_CELL_SIZE * MAX_CELL_BASELINE_DEVIATION;

  for (const cell of cells) {
    const widthDeviation = Math.abs(cell.width - medianWidth) / medianWidth;
    const heightDeviation = Math.abs(cell.height - medianHeight) / medianHeight;
    if (
      widthDeviation > MAX_CELL_SCALE_DEVIATION ||
      heightDeviation > MAX_CELL_SCALE_DEVIATION ||
      Math.abs(cell.bottom - medianBottom) > baselineTolerance
    ) {
      throw new AppError(
        "invalid_sprite_sheet",
        `The ${cell.pose} cell does not match the scale or baseline of the other poses`,
        422,
      );
    }
  }

  return { cellSize: CHARACTER_CELL_SIZE };
}

export async function sliceSpriteSheet(sheetPath: string, outputDirectory: string): Promise<PoseFrames> {
  await validateSpriteSheet(sheetPath);
  await mkdir(outputDirectory, { recursive: true });

  const frames = {} as PoseFrames;
  for (const { pose, x, y } of POSE_LAYOUT) {
    const outputPath = path.join(outputDirectory, poseFileName(pose));
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
