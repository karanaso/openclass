import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { startTestInfra, type TestInfra } from "./helpers/infra";
import { resetEnvCache } from "@/lib/env";
import { resetStorage, getStorage } from "@/server/storage";

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
});
