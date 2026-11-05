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

export type ComposedVideo = {
  videoPath: string;
  posterPath: string;
  captionsPath: string;
  durationMs: number;
  sizeBytes: number;
};

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
}): Promise<ComposedVideo> {
  if (input.slides.length === 0) throw new Error("No slides to render");
  const pauseMs = input.pauseMs ?? 600;
  const segmentPaths: string[] = [];
  const captions: string[] = ["WEBVTT", ""];
  let cursor = 0;

  for (const [index, slide] of input.slides.entries()) {
    const durationMs = slide.audioDurationMs + pauseMs;
    const segmentPath = path.join(input.workDir, `segment-${String(index + 1).padStart(3, "0")}.mp4`);
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
  await runFfmpeg(["-i", input.slides[0].imagePath, "-frames:v", "1", "-vf", "scale=1280:-2", "-q:v", "3", posterPath]);

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
