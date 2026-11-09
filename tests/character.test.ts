import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetEnvCache } from "@/lib/env";
import {
  CHARACTER_CELL_SIZE,
  CHARACTER_LOOP_POSES,
  CHARACTER_LOOP_SECONDS,
  inspectSpriteCells,
  sliceSpriteSheet,
  validateSpriteSheet,
} from "@/server/media/character";
import { probeImageInfo } from "@/server/media/ffmpeg";

const execFileAsync = promisify(execFile);
const fixture = path.join(process.cwd(), "src", "server", "media", "fixtures", "mock-character-sheet.png");

let workDir: string;

beforeAll(async () => {
  process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
  process.env.AUTH_SECRET = "a".repeat(40);
  process.env.TEACHER_PASSWORD = "secret";
  process.env.AI_PROVIDER = "mock";
  process.env.TTS_PROVIDER = "mock";
  process.env.VIDEO_RENDER_TIMEOUT_MS = "60000";
  resetEnvCache();
  workDir = await mkdtemp(path.join(os.tmpdir(), "lessonlab-character-"));
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

async function makePng(name: string, size: string, pixFmt: "rgba" | "rgb24"): Promise<string> {
  const output = path.join(workDir, name);
  await execFileAsync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=0x2563eb:s=${size}:r=1`,
    "-frames:v",
    "1",
    "-pix_fmt",
    pixFmt,
    output,
  ]);
  return output;
}

async function modifiedSheet(name: string, channel: (fn: "r" | "g" | "b" | "alpha") => string): Promise<string> {
  const output = path.join(workDir, name);
  await execFileAsync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    fixture,
    "-frames:v",
    "1",
    "-vf",
    `format=rgba,geq=r='${channel("r")}':g='${channel("g")}':b='${channel("b")}':a='${channel("alpha")}'`,
    "-pix_fmt",
    "rgba",
    output,
  ]);
  return output;
}

describe("sprite sheet handling", () => {
  it("accepts the mock fixture and returns the cell size", async () => {
    await expect(validateSpriteSheet(fixture)).resolves.toEqual({ cellSize: CHARACTER_CELL_SIZE });

    const cells = await inspectSpriteCells(fixture);
    expect(cells.map((cell) => cell.pose)).toEqual([
      "neutral",
      "blink",
      "talkClosed",
      "talkOpen",
      "wave",
      "lean",
    ]);
    for (const cell of cells) {
      expect(cell.coverage).toBeGreaterThan(0.03);
      expect(cell.coverage).toBeLessThan(0.75);
      expect(cell.width).toBeGreaterThan(0);
      expect(cell.height).toBeGreaterThan(0);
    }
  });

  it("slices a valid sheet into six equal visible frames", async () => {
    const outputDirectory = path.join(workDir, "frames");
    const frames = await sliceSpriteSheet(fixture, outputDirectory);

    expect(Object.keys(frames).sort()).toEqual([
      "blink",
      "lean",
      "neutral",
      "talkClosed",
      "talkOpen",
      "wave",
    ]);
    for (const frame of Object.values(frames)) {
      const info = await probeImageInfo(frame);
      expect(info).toEqual({ width: 512, height: 512, pixFmt: "rgba" });
    }
    expect(await readdir(outputDirectory)).toHaveLength(6);
  });

  it("rejects a sheet with the wrong dimensions without writing frames", async () => {
    const sheet = await makePng("wrong-size.png", "1024x1024", "rgba");
    const outputDirectory = path.join(workDir, "wrong-size-frames");
    await expect(sliceSpriteSheet(sheet, outputDirectory)).rejects.toThrow(/1536x1024/);
    await expect(readdir(outputDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects an opaque sheet without an alpha channel", async () => {
    const sheet = await makePng("opaque.png", "1536x1024", "rgb24");
    await expect(validateSpriteSheet(sheet)).rejects.toThrow(/transparent/);
  });

  it("rejects a sheet with an empty cell", async () => {
    const sheet = await modifiedSheet(
      "empty-cell.png",
      (fn) =>
        fn === "alpha"
          ? "if(between(X,0,511)*between(Y,0,511),0,alpha(X,Y))"
          : `${fn}(X,Y)`,
    );
    await expect(validateSpriteSheet(sheet)).rejects.toThrow(/no visible character/i);
  });

  it("rejects a sheet whose poses disagree on baseline", async () => {
    const shifted = (fn: string) =>
      `if(between(X,0,511)*between(Y,0,511),if(gte(Y-40,0),${fn}(X,Y-40),0),${fn}(X,Y))`;
    const sheet = await modifiedSheet("misaligned.png", (fn) => shifted(fn));
    await expect(validateSpriteSheet(sheet)).rejects.toThrow(/scale or baseline/i);
  });

  it("builds a loop that covers every pose", () => {
    expect(CHARACTER_LOOP_SECONDS).toBeCloseTo(6, 5);
    expect([...CHARACTER_LOOP_POSES].sort()).toEqual([
      "blink",
      "lean",
      "neutral",
      "talkClosed",
      "talkOpen",
      "wave",
    ]);
  });
});
