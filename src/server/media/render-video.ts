import { stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { runFfmpeg } from "./ffmpeg";

export type SlideInput = {
  pageNumber: number;
  imagePath: string;
  audioPath: string;
  audioDurationMs: number;
  script: string;
};

export type VisualInput = {
  scenePath: string;
  characterLoopPath: string;
};

export type ComposedVideo = {
  videoPath: string;
  posterPath: string;
  captionsPath: string;
  durationMs: number;
  sizeBytes: number;
};

export const COMPOSED_WIDTH = 1920;
export const COMPOSED_HEIGHT = 1080;
export const SLIDE_BOX = { x: 64, y: 60, width: 1280, height: 960 };
export const CHARACTER_WIDTH = 480;
export const CHARACTER_MARGIN = 80;
export const CHARACTER_BOTTOM_MARGIN = 40;
export const CHARACTER_BOB_AMPLITUDE = 10;
export const CHARACTER_BOB_PERIOD_SECONDS = 3;

export function characterFilterGraph(): string {
  const bob = `${CHARACTER_BOB_AMPLITUDE}*sin(2*PI*t/${CHARACTER_BOB_PERIOD_SECONDS})`;
  return [
    `[0:v]scale=${SLIDE_BOX.width}:${SLIDE_BOX.height}:force_original_aspect_ratio=decrease,` +
      `pad=${SLIDE_BOX.width}:${SLIDE_BOX.height}:(ow-iw)/2:(oh-ih)/2:color=white,format=rgba[slide]`,
    `[1:v]scale=${COMPOSED_WIDTH}:${COMPOSED_HEIGHT}:force_original_aspect_ratio=increase,` +
      `crop=${COMPOSED_WIDTH}:${COMPOSED_HEIGHT},format=rgba[scene]`,
    `[scene][slide]overlay=${SLIDE_BOX.x}:${SLIDE_BOX.y}:format=auto[base]`,
    `[2:v]scale=${CHARACTER_WIDTH}:-1[character]`,
    `[base][character]overlay=x=W-w-${CHARACTER_MARGIN}:y=H-h-${CHARACTER_BOTTOM_MARGIN}+${bob}:format=auto[v]`,
  ].join(";");
}

function characterSegmentArgs(input: {
  imagePath: string;
  audioPath: string;
  durationMs: number;
  visual: VisualInput;
  segmentPath: string;
}): string[] {
  const loopDecoder = input.visual.characterLoopPath.endsWith(".webm") ? ["-c:v", "libvpx-vp9"] : [];
  return [
    "-loop",
    "1",
    "-framerate",
    "30",
    "-i",
    input.imagePath,
    "-loop",
    "1",
    "-framerate",
    "30",
    "-i",
    input.visual.scenePath,
    ...loopDecoder,
    "-stream_loop",
    "-1",
    "-i",
    input.visual.characterLoopPath,
    "-i",
    input.audioPath,
    "-filter_complex",
    characterFilterGraph(),
    "-map",
    "[v]",
    "-map",
    "3:a",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-pix_fmt",
    "yuv420p",
    "-t",
    (input.durationMs / 1000).toFixed(3),
    "-movflags",
    "+faststart",
    input.segmentPath,
  ];
}

function vttTimestamp(ms: number): string {
  const totalSeconds = Math.max(0, ms) / 1000;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const millis = Math.round((totalSeconds - Math.floor(totalSeconds)) * 1000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

export async function composeLessonVideo(input: {
  slides: SlideInput[];
  workDir: string;
  pauseMs?: number;
  visual?: VisualInput | null;
}): Promise<ComposedVideo> {
  if (input.slides.length === 0) throw new Error("No slides to render");
  const pauseMs = input.pauseMs ?? 600;
  const segmentPaths: string[] = [];
  const captions: string[] = ["WEBVTT", ""];
  let cursor = 0;

  for (const [index, slide] of input.slides.entries()) {
    const durationMs = slide.audioDurationMs + pauseMs;
    const segmentPath = path.join(input.workDir, `segment-${String(index + 1).padStart(3, "0")}.mp4`);
    if (input.visual) {
      await runFfmpeg(
        characterSegmentArgs({
          imagePath: slide.imagePath,
          audioPath: slide.audioPath,
          durationMs,
          visual: input.visual,
          segmentPath,
        }),
      );
    } else {
      await runFfmpeg([
        "-loop",
        "1",
        "-framerate",
        "30",
        "-i",
        slide.imagePath,
        "-i",
        slide.audioPath,
        "-vf",
        "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-tune",
        "stillimage",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-pix_fmt",
        "yuv420p",
        "-t",
        (durationMs / 1000).toFixed(3),
        "-movflags",
        "+faststart",
        segmentPath,
      ]);
    }
    segmentPaths.push(segmentPath);

    captions.push(`${vttTimestamp(cursor)} --> ${vttTimestamp(cursor + durationMs)}`);
    captions.push(slide.script.replace(/\r?\n/g, " ").trim());
    captions.push("");
    cursor += durationMs;
  }

  const listPath = path.join(input.workDir, "segments.txt");
  await writeFile(listPath, segmentPaths.map((segment) => `file '${segment.replace(/'/g, "'\\''")}'`).join("\n"), "utf8");

  const videoPath = path.join(input.workDir, "lesson.mp4");
  await runFfmpeg([
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    videoPath,
  ]);

  const posterPath = path.join(input.workDir, "poster.jpg");
  await runFfmpeg(["-i", segmentPaths[0], "-frames:v", "1", "-vf", "scale=1280:-2", "-q:v", "3", posterPath]);

  const captionsPath = path.join(input.workDir, "captions.vtt");
  await writeFile(captionsPath, captions.join("\n"), "utf8");

  const videoStats = await stat(videoPath);
  return {
    videoPath,
    posterPath,
    captionsPath,
    durationMs: cursor,
    sizeBytes: videoStats.size,
  };
}
