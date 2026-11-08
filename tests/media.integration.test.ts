import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { startTestInfra, type TestInfra } from "./helpers/infra";
import { resetEnvCache } from "@/lib/env";
import { MockImageProvider, type ImageProvider } from "@/server/media/image";
import type { VisualPromptInput } from "@/server/media/image-prompts";
import { cancelLesson, deleteLesson } from "@/server/services/lesson-control";
import { getLessonDetail } from "@/server/services/classes";
import { resetStorage, getStorage } from "@/server/storage";

const execFileAsync = promisify(execFile);

let infra: TestInfra;
let prisma: PrismaClient;
let storageRoot: string;
let tts: typeof import("@/worker/processors/tts");
let render: typeof import("@/worker/processors/render");
let ffmpeg: typeof import("@/server/media/ffmpeg");
let queueModule: typeof import("@/server/queue");

beforeAll(async () => {
  infra = await startTestInfra();
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "lessonlab-media-"));
  process.env.DATABASE_URL = infra.databaseUrl;
  process.env.REDIS_URL = infra.redisUrl;
  process.env.AUTH_SECRET = "a".repeat(40);
  process.env.TEACHER_PASSWORD = "test";
  process.env.AI_PROVIDER = "mock";
  process.env.TTS_PROVIDER = "mock";
  process.env.STORAGE_ROOT = storageRoot;
  process.env.MAX_VIDEO_SECONDS = "900";
  process.env.VIDEO_RENDER_TIMEOUT_MS = "120000";
  process.env.MAX_PDF_PAGES = "20";
  resetEnvCache();
  resetStorage();

  const redis = await import("@/server/redis");
  await redis.closeRedis();
  queueModule = await import("@/server/queue");
  await queueModule.closeLessonQueue();
  prisma = (await import("@/server/db")).prisma;
  tts = await import("@/worker/processors/tts");
  render = await import("@/worker/processors/render");
  ffmpeg = await import("@/server/media/ffmpeg");
}, 120_000);

afterAll(async () => {
  await queueModule?.closeLessonQueue();
  const redis = await import("@/server/redis");
  await redis.closeRedis();
  await prisma?.$disconnect();
  await rm(storageRoot, { recursive: true, force: true });
  await infra?.stop();
});

async function createMediaLesson(name: string) {
  const classroom = await prisma.class.create({ data: { name } });
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < 2; index += 1) {
    const page = document.addPage([600, 400]);
    page.drawText(`Page ${index + 1}: Photosynthesis and cellular respiration.`, { x: 40, y: 340, size: 14, font });
    page.drawText("Chlorophyll absorbs light and mitochondria release energy.", { x: 40, y: 300, size: 12, font });
  }
  const bytes = new Uint8Array(await document.save());
  const lesson = await prisma.lesson.create({
    data: {
      classId: classroom.id,
      title: name,
      originalFilename: `${name}.pdf`,
      storageKey: `lessons/${classroom.id}/original.pdf`,
      checksum: `media-${Math.random()}`,
      sizeBytes: bytes.byteLength,
      pageCount: 2,
      sourceLocale: "en",
      status: "READY",
    },
  });
  await getStorage().put(lesson.storageKey, bytes);
  await prisma.lessonPage.createMany({
    data: [
      { lessonId: lesson.id, pageNumber: 1, text: "Photosynthesis converts light into chemical energy." },
      { lessonId: lesson.id, pageNumber: 2, text: "Cellular respiration releases energy from glucose." },
    ],
  });
  await prisma.narrationSegment.createMany({
    data: [
      { lessonId: lesson.id, pageNumber: 1, locale: "el", script: "Η φωτοσύνθεση μετατρέπει το φως σε ενέργεια." },
      { lessonId: lesson.id, pageNumber: 1, locale: "en", script: "Photosynthesis converts light into energy." },
      { lessonId: lesson.id, pageNumber: 2, locale: "el", script: "Η κυτταρική αναπνοή απελευθερώνει ενέργεια." },
      { lessonId: lesson.id, pageNumber: 2, locale: "en", script: "Cellular respiration releases energy." },
    ],
  });
  await ffmpeg.renderPdfPageImages(
    getStorage().getAbsolutePath(lesson.storageKey),
    path.join(storageRoot, "lessons", lesson.id, "pages"),
    { maxPages: 20, prefix: "page" },
  );
  return lesson;
}

class CountingImageProvider implements ImageProvider {
  sceneCalls = 0;
  sheetCalls = 0;
  private readonly inner = new MockImageProvider();

  async generateScene(input: VisualPromptInput) {
    this.sceneCalls += 1;
    return this.inner.generateScene(input);
  }

  async generateCharacterSheet(input: VisualPromptInput) {
    this.sheetCalls += 1;
    return this.inner.generateCharacterSheet(input);
  }
}

class FailingImageProvider implements ImageProvider {
  async generateScene(): Promise<never> {
    throw new Error("image provider unavailable");
  }

  async generateCharacterSheet(): Promise<never> {
    throw new Error("image provider unavailable");
  }
}

describe("speech and video", () => {
  it("writes per-page audio and records durations", async () => {
    const lesson = await createMediaLesson("TTS lesson");
    await tts.processTts({ lessonId: lesson.id, stage: "tts", version: 0, locale: "el" }, { enqueue: false });

    const segments = await prisma.narrationSegment.findMany({ where: { lessonId: lesson.id, locale: "el" }, orderBy: { pageNumber: "asc" } });
    expect(segments).toHaveLength(2);
    for (const segment of segments) {
      expect(segment.audioKey).toBeTruthy();
      expect(segment.durationMs).toBeGreaterThan(0);
      expect(await getStorage().exists(segment.audioKey!)).toBe(true);
    }
    const video = await prisma.videoAsset.findUniqueOrThrow({ where: { lessonId_locale: { lessonId: lesson.id, locale: "el" } } });
    expect(video.status).toBe("PENDING");
  });

  it("renders a seekable two-page MP4 with captions and a poster", async () => {
    const lesson = await createMediaLesson("Video lesson");
    await prisma.card.create({
      data: {
        lessonId: lesson.id,
        itemKey: "existing-card",
        position: 0,
        sourcePage: 1,
        translations: { create: [{ locale: "el", prompt: "Ερώτηση", answer: "Απάντηση" }] },
      },
    });
    await tts.processTts({ lessonId: lesson.id, stage: "tts", version: 0, locale: "el" }, { enqueue: false });
    await render.processRender({ lessonId: lesson.id, stage: "render", version: 0, locale: "el" });

    const video = await prisma.videoAsset.findUniqueOrThrow({ where: { lessonId_locale: { lessonId: lesson.id, locale: "el" } } });
    expect(video.status).toBe("READY");
    expect(video.storageKey).toBeTruthy();
    expect(video.durationMs).toBeGreaterThan(2000);
    expect(video.sizeBytes).toBeGreaterThan(1000);
    expect(await getStorage().exists(video.storageKey!)).toBe(true);
    expect(await getStorage().exists(video.captionsKey!)).toBe(true);
    expect(await getStorage().exists(video.posterKey!)).toBe(true);

    const captions = await readFile(getStorage().getAbsolutePath(video.captionsKey!), "utf8");
    expect(captions.startsWith("WEBVTT")).toBe(true);
    expect(captions).toContain("φωτοσύνθεση");

    const header = (await readFile(getStorage().getAbsolutePath(video.storageKey!))).subarray(0, 1024 * 1024);
    expect(header.includes(Buffer.from("ftyp"))).toBe(true);
    expect(header.includes(Buffer.from("moov"))).toBe(true);

    const updated = await prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(updated.status).toBe("READY");
    expect(await prisma.card.count({ where: { lessonId: lesson.id } })).toBe(1);
  });

  it("renders both language variants on demand", async () => {
    const lesson = await createMediaLesson("Bilingual video");
    await tts.processTts({ lessonId: lesson.id, stage: "tts", version: 0, locale: "el" }, { enqueue: false });
    await render.processRender({ lessonId: lesson.id, stage: "render", version: 0, locale: "el" });
    await tts.processTts({ lessonId: lesson.id, stage: "tts", version: 0, locale: "en" }, { enqueue: false });
    await render.processRender({ lessonId: lesson.id, stage: "render", version: 0, locale: "en" });

    const videos = await prisma.videoAsset.findMany({ where: { lessonId: lesson.id }, orderBy: { locale: "asc" } });
    expect(videos).toHaveLength(2);
    expect(videos.map((video) => video.status)).toEqual(["READY", "READY"]);
    expect(videos.map((video) => video.locale)).toEqual(["el", "en"]);
  });

  it("keeps the lesson usable when video rendering fails", async () => {
    const lesson = await createMediaLesson("Failed video");
    await prisma.narrationSegment.deleteMany({ where: { lessonId: lesson.id } });
    await render.processRender({ lessonId: lesson.id, stage: "render", version: 0, locale: "el" });

    const video = await prisma.videoAsset.findUniqueOrThrow({ where: { lessonId_locale: { lessonId: lesson.id, locale: "el" } } });
    expect(video.status).toBe("FAILED");
    expect(video.error).toMatch(/missing/i);
    const updated = await prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(updated.status).toBe("READY");
    expect(await prisma.card.count({ where: { lessonId: lesson.id } })).toBe(0);
  });

  it("skips videos that exceed the configured duration limit", async () => {
    const lesson = await createMediaLesson("Too long");
    await tts.processTts({ lessonId: lesson.id, stage: "tts", version: 0, locale: "el" }, { enqueue: false });
    process.env.MAX_VIDEO_SECONDS = "1";
    resetEnvCache();
    await render.processRender({ lessonId: lesson.id, stage: "render", version: 0, locale: "el" });
    process.env.MAX_VIDEO_SECONDS = "900";
    resetEnvCache();

    const video = await prisma.videoAsset.findUniqueOrThrow({ where: { lessonId_locale: { lessonId: lesson.id, locale: "el" } } });
    expect(video.status).toBe("SKIPPED");
    expect(video.error).toMatch(/limit/);
    expect((await prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } })).status).toBe("READY");
  });

  it("generates a lesson visual and renders an animated character video", async () => {
    const lesson = await createMediaLesson("Character video");
    const provider = new CountingImageProvider();
    await tts.processTts({ lessonId: lesson.id, stage: "tts", version: 0, locale: "el" }, { enqueue: false });
    await render.processRender(
      { lessonId: lesson.id, stage: "render", version: 0, locale: "el" },
      { imageProvider: provider },
    );

    expect(provider.sceneCalls).toBe(1);
    expect(provider.sheetCalls).toBe(1);

    const visual = await prisma.lessonVisual.findUniqueOrThrow({ where: { lessonId: lesson.id } });
    expect(visual.status).toBe("READY");
    expect(visual.jobVersion).toBe(0);
    expect(visual.model).toBe("mock-image-v1");
    expect(visual.promptVersion).toBe("v1");
    expect(visual.sceneKey).toBeTruthy();
    expect(visual.characterSheetKey).toBeTruthy();
    expect(visual.characterLoopKey).toMatch(/character-loop\.(webm|mov)$/);
    const storage = getStorage();
    for (const key of [visual.sceneKey!, visual.characterSheetKey!, visual.characterLoopKey!]) {
      expect(await storage.exists(key)).toBe(true);
    }

    const visualJob = await prisma.generationJob.findUniqueOrThrow({
      where: { lessonId_stage: { lessonId: lesson.id, stage: "VISUAL" } },
    });
    expect(visualJob.status).toBe("COMPLETED");
    expect(visualJob.model).toBe("mock-image-v1");

    const loopPath = storage.getAbsolutePath(visual.characterLoopKey!);
    expect(await ffmpeg.probeDurationMs(loopPath)).toBe(6000);
    const loopProbe = JSON.parse(
      (
        await execFileAsync("ffprobe", [
          "-v",
          "error",
          "-show_entries",
          "stream=width,height,pix_fmt,r_frame_rate:stream_tags=alpha_mode",
          "-of",
          "json",
          loopPath,
        ])
      ).stdout,
    ) as { streams: Array<{ width: number; height: number; pix_fmt: string; r_frame_rate: string; tags?: { alpha_mode?: string } }> };
    expect(loopProbe.streams[0]).toMatchObject({ width: 512, height: 512, r_frame_rate: "30/1" });
    expect(loopProbe.streams[0].tags?.alpha_mode).toBe("1");

    const video = await prisma.videoAsset.findUniqueOrThrow({
      where: { lessonId_locale: { lessonId: lesson.id, locale: "el" } },
    });
    expect(video.status).toBe("READY");
    expect(video.posterKey).toBeTruthy();
    const videoPath = storage.getAbsolutePath(video.storageKey!);
    expect(await ffmpeg.probeImageInfo(videoPath)).toMatchObject({ width: 1920, height: 1080 });
    expect(await ffmpeg.probeImageInfo(storage.getAbsolutePath(video.posterKey!))).toMatchObject({
      width: 1280,
      height: 720,
    });
    expect(await readFile(storage.getAbsolutePath(video.captionsKey!), "utf8")).toContain("φωτοσύνθεση");

    const frameA = path.join(storageRoot, `frame-a-${lesson.id}.png`);
    const frameB = path.join(storageRoot, `frame-b-${lesson.id}.png`);
    await ffmpeg.runFfmpeg(["-ss", "0", "-i", videoPath, "-frames:v", "1", frameA]);
    await ffmpeg.runFfmpeg(["-ss", "2", "-i", videoPath, "-frames:v", "1", frameB]);
    expect(Buffer.from(await readFile(frameA)).equals(Buffer.from(await readFile(frameB)))).toBe(false);

    const detail = await getLessonDetail(lesson.id);
    expect(detail.visual?.status).toBe("READY");
  });

  it("reuses one visual set across locales and regenerates it only for a new version", async () => {
    const lesson = await createMediaLesson("Visual reuse");
    const provider = new CountingImageProvider();
    await tts.processTts({ lessonId: lesson.id, stage: "tts", version: 0, locale: "el" }, { enqueue: false });
    await render.processRender(
      { lessonId: lesson.id, stage: "render", version: 0, locale: "el" },
      { imageProvider: provider },
    );
    await tts.processTts({ lessonId: lesson.id, stage: "tts", version: 0, locale: "en" }, { enqueue: false });
    await render.processRender(
      { lessonId: lesson.id, stage: "render", version: 0, locale: "en" },
      { imageProvider: provider },
    );

    expect(provider.sceneCalls).toBe(1);
    expect(provider.sheetCalls).toBe(1);
    const first = await prisma.lessonVisual.findUniqueOrThrow({ where: { lessonId: lesson.id } });
    const videos = await prisma.videoAsset.findMany({ where: { lessonId: lesson.id } });
    expect(videos.map((video) => video.status)).toEqual(["READY", "READY"]);

    await prisma.lesson.update({ where: { id: lesson.id }, data: { jobVersion: 1 } });
    await render.processRender(
      { lessonId: lesson.id, stage: "render", version: 1, locale: "el" },
      { imageProvider: provider },
    );

    expect(provider.sceneCalls).toBe(2);
    expect(provider.sheetCalls).toBe(2);
    const second = await prisma.lessonVisual.findUniqueOrThrow({ where: { lessonId: lesson.id } });
    expect(second.id).toBe(first.id);
    expect(second.jobVersion).toBe(1);
    expect(second.status).toBe("READY");
  });

  it("renders the standard video when visual generation fails", async () => {
    const lesson = await createMediaLesson("Visual fallback");
    await tts.processTts({ lessonId: lesson.id, stage: "tts", version: 0, locale: "el" }, { enqueue: false });
    await render.processRender(
      { lessonId: lesson.id, stage: "render", version: 0, locale: "el" },
      { imageProvider: new FailingImageProvider() },
    );

    const visual = await prisma.lessonVisual.findUniqueOrThrow({ where: { lessonId: lesson.id } });
    expect(visual.status).toBe("FAILED");
    expect(visual.error).toMatch(/image provider unavailable/);
    const visualJob = await prisma.generationJob.findUniqueOrThrow({
      where: { lessonId_stage: { lessonId: lesson.id, stage: "VISUAL" } },
    });
    expect(visualJob.status).toBe("FAILED");

    const video = await prisma.videoAsset.findUniqueOrThrow({
      where: { lessonId_locale: { lessonId: lesson.id, locale: "el" } },
    });
    expect(video.status).toBe("READY");
    const detail = await getLessonDetail(lesson.id);
    expect(detail.visual?.status).toBe("FAILED");
    expect(detail.visual?.error).toMatch(/image provider unavailable/);
  });

  it("cleans visual assets on cancel and deletes them with the lesson", async () => {
    const storage = getStorage();
    const cancelled = await createMediaLesson("Cancel visual");
    const cancelledKey = `lessons/${cancelled.id}/visual/scene.png`;
    await storage.put(cancelledKey, Buffer.from("scene"));
    await prisma.lessonVisual.create({
      data: { lessonId: cancelled.id, status: "READY", jobVersion: 0, sceneKey: cancelledKey },
    });

    await cancelLesson(cancelled.id, prisma, storage);
    expect(await prisma.lessonVisual.findUnique({ where: { lessonId: cancelled.id } })).toBeNull();
    expect(await storage.exists(cancelledKey)).toBe(false);

    const deleted = await createMediaLesson("Delete visual");
    const deletedKey = `lessons/${deleted.id}/visual/scene.png`;
    await storage.put(deletedKey, Buffer.from("scene"));
    await prisma.lessonVisual.create({
      data: { lessonId: deleted.id, status: "READY", jobVersion: 0, sceneKey: deletedKey },
    });

    await deleteLesson(deleted.id, prisma, storage);
    expect(await prisma.lessonVisual.findUnique({ where: { lessonId: deleted.id } })).toBeNull();
    expect(await storage.exists(deletedKey)).toBe(false);
  });
});
