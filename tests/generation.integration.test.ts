import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { PDFDocument } from "pdf-lib";
import { startTestInfra, type TestInfra } from "./helpers/infra";
import { resetEnvCache } from "@/lib/env";
import { resetStorage, getStorage } from "@/server/storage";

let infra: TestInfra;
let prisma: PrismaClient;
let storageRoot: string;
let orchestrator: typeof import("@/server/generation/orchestrator");
let mockModule: typeof import("@/server/generation/mock-provider");
let usageService: typeof import("@/server/services/usage");
let extractProcessor: typeof import("@/worker/processors/extract");
let queueModule: typeof import("@/server/queue");

beforeAll(async () => {
  infra = await startTestInfra();
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "lessonlab-generation-"));
  process.env.DATABASE_URL = infra.databaseUrl;
  process.env.REDIS_URL = infra.redisUrl;
  process.env.AUTH_SECRET = "a".repeat(40);
  process.env.TEACHER_PASSWORD = "test";
  process.env.AI_PROVIDER = "mock";
  process.env.TTS_PROVIDER = "mock";
  process.env.STORAGE_ROOT = storageRoot;
  process.env.CARD_MIN = "2";
  process.env.CARD_MAX = "4";
  process.env.QUESTIONNAIRE_MIN = "3";
  process.env.QUESTIONNAIRE_MAX = "5";
  process.env.GAME_MIN = "2";
  process.env.GAME_MAX = "4";
  process.env.GENERATION_MAX_ATTEMPTS = "2";
  resetEnvCache();
  resetStorage();

  const redis = await import("@/server/redis");
  await redis.closeRedis();
  queueModule = await import("@/server/queue");
  await queueModule.closeLessonQueue();
  prisma = (await import("@/server/db")).prisma;
  orchestrator = await import("@/server/generation/orchestrator");
  mockModule = await import("@/server/generation/mock-provider");
  usageService = await import("@/server/services/usage");
  extractProcessor = await import("@/worker/processors/extract");
}, 120_000);

afterAll(async () => {
  await queueModule?.closeLessonQueue();
  const redis = await import("@/server/redis");
  await redis.closeRedis();
  await prisma?.$disconnect();
  await rm(storageRoot, { recursive: true, force: true });
  await infra?.stop();
});

async function createLessonWithPages() {
  const classroom = await prisma.class.create({ data: { name: `Generation ${Date.now()}-${Math.random()}` } });
  const lesson = await prisma.lesson.create({
    data: {
      classId: classroom.id,
      title: "Biology",
      originalFilename: "biology.pdf",
      storageKey: "lessons/test/original.pdf",
      checksum: `checksum-${Math.random()}`,
      sizeBytes: 100,
      pageCount: 2,
      sourceLocale: "en",
      status: "GENERATING",
      passThreshold: 60,
    },
  });
  await prisma.lessonPage.createMany({
    data: [
      {
        lessonId: lesson.id,
        pageNumber: 1,
        text: "Photosynthesis converts light energy into chemical energy. Plants use chlorophyll to absorb light. Mitochondria produce ATP for the cell.",
      },
      {
        lessonId: lesson.id,
        pageNumber: 2,
        text: "Cellular respiration releases energy from glucose. It happens in the mitochondria of eukaryotic cells. Oxygen is used in aerobic respiration.",
      },
    ],
  });
  return { classroom, lesson };
}

describe("generation orchestration", () => {
  it("publishes bilingual artifacts and records usage", async () => {
    const { classroom, lesson } = await createLessonWithPages();
    const result = await orchestrator.generateLessonContent(lesson.id, {
      provider: new mockModule.MockContentProvider(),
      retryDelayMs: 0,
    });

    expect(result.artifacts.cards.length).toBeGreaterThanOrEqual(2);
    const updated = await prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(updated.status).toBe("READY");
    expect(await prisma.card.count({ where: { lessonId: lesson.id } })).toBe(result.artifacts.cards.length);
    expect(await prisma.cardTranslation.count({ where: { card: { lessonId: lesson.id } } })).toBe(result.artifacts.cards.length * 2);
    expect(await prisma.question.count({ where: { lessonId: lesson.id, mode: "QUESTIONNAIRE" } })).toBe(
      result.artifacts.questionnaire.length,
    );
    expect(await prisma.question.count({ where: { lessonId: lesson.id, mode: "GAME" } })).toBe(result.artifacts.game.length);

    const job = await prisma.generationJob.findUniqueOrThrow({
      where: { lessonId_stage: { lessonId: lesson.id, stage: "GENERATE" } },
    });
    expect(job.status).toBe("COMPLETED");
    expect(job.inputTokens).toBeGreaterThan(0);
    expect(job.estimatedCostUsd).toBeGreaterThan(0);

    const lessonUsage = await usageService.getLessonUsage(lesson.id);
    expect(lessonUsage.tokens).toBe(job.inputTokens + job.outputTokens);
    const classUsage = await usageService.getClassUsage(classroom.id);
    expect(classUsage.tokens).toBe(lessonUsage.tokens);
    expect(classUsage.estimatedCostUsd).toBeCloseTo(job.estimatedCostUsd, 8);
  });

  it("normalizes duplicate narration segments before publishing", async () => {
    const { lesson } = await createLessonWithPages();
    const base = new mockModule.MockContentProvider();
    const duplicateNarration = {
      cards: base.cards.bind(base),
      questions: base.questions.bind(base),
      narration: async (input: Parameters<typeof base.narration>[0]) => {
        const result = await base.narration(input);
        return {
          items: result.items.flatMap((segment, index) =>
            index === 0
              ? [segment, { ...segment, pageNumber: 99 }, segment]
              : [segment],
          ),
          usage: result.usage,
        };
      },
    };

    const result = await orchestrator.generateLessonContent(lesson.id, {
      provider: duplicateNarration,
      retryDelayMs: 0,
    });

    expect(result.artifacts.narration.map((segment) => segment.pageNumber)).toEqual([1, 2]);
    const published = await prisma.narrationSegment.findMany({
      where: { lessonId: lesson.id, locale: "en" },
      orderBy: { pageNumber: "asc" },
    });
    expect(published.map((segment) => segment.pageNumber)).toEqual([1, 2]);
    expect((await prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } })).status).toBe("READY");
  });

  it("replaces published artifacts on regeneration", async () => {
    const { lesson } = await createLessonWithPages();
    await orchestrator.generateLessonContent(lesson.id, {
      provider: new mockModule.MockContentProvider(),
      retryDelayMs: 0,
    });
    const firstIds = (await prisma.card.findMany({ where: { lessonId: lesson.id }, orderBy: { position: "asc" } })).map(
      (card) => card.id,
    );
    const second = await orchestrator.generateLessonContent(lesson.id, {
      provider: new mockModule.MockContentProvider(),
      retryDelayMs: 0,
    });
    const secondIds = (await prisma.card.findMany({ where: { lessonId: lesson.id }, orderBy: { position: "asc" } })).map(
      (card) => card.id,
    );
    expect(secondIds).toHaveLength(firstIds.length);
    expect(secondIds).not.toEqual(firstIds);
    expect(second.artifacts.cards.length).toBe(secondIds.length);
    expect((await prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } })).status).toBe("READY");
  });

  it("retries a transient provider failure and succeeds", async () => {
    const { lesson } = await createLessonWithPages();
    const base = new mockModule.MockContentProvider();
    let calls = 0;
    const flaky = {
      cards: async (input: Parameters<typeof base.cards>[0]) => {
        calls += 1;
        if (calls === 1) throw new Error("transient failure");
        return base.cards(input);
      },
      questions: base.questions.bind(base),
      narration: base.narration.bind(base),
    };

    const result = await orchestrator.generateLessonContent(lesson.id, {
      provider: flaky,
      maxAttempts: 2,
      retryDelayMs: 0,
    });
    expect(result.artifacts.cards.length).toBeGreaterThanOrEqual(2);
    const job = await prisma.generationJob.findUniqueOrThrow({
      where: { lessonId_stage: { lessonId: lesson.id, stage: "GENERATE" } },
    });
    expect(job.attempts).toBe(2);
    expect(job.status).toBe("COMPLETED");
  });

  it("marks a permanent failure but preserves previously published artifacts", async () => {
    const { lesson } = await createLessonWithPages();
    await orchestrator.generateLessonContent(lesson.id, {
      provider: new mockModule.MockContentProvider(),
      retryDelayMs: 0,
    });
    const previousCards = await prisma.card.count({ where: { lessonId: lesson.id } });

    const failing = {
      cards: async () => {
        throw new Error("provider is down");
      },
      questions: async () => {
        throw new Error("provider is down");
      },
      narration: async () => {
        throw new Error("provider is down");
      },
    };

    await expect(
      orchestrator.generateLessonContent(lesson.id, { provider: failing, maxAttempts: 1, retryDelayMs: 0 }),
    ).rejects.toThrow(/provider is down/);

    const updated = await prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(updated.status).toBe("FAILED");
    expect(updated.failureReason).toContain("provider is down");
    expect(await prisma.card.count({ where: { lessonId: lesson.id } })).toBe(previousCards);
    const job = await prisma.generationJob.findUniqueOrThrow({
      where: { lessonId_stage: { lessonId: lesson.id, stage: "GENERATE" } },
    });
    expect(job.status).toBe("FAILED");
  });

  it("fails extraction for an image-only PDF with the unsupported message", async () => {
    const classroom = await prisma.class.create({ data: { name: "Image only" } });
    const document = await PDFDocument.create();
    document.addPage([600, 400]);
    const bytes = new Uint8Array(await document.save());
    const lesson = await prisma.lesson.create({
      data: {
        classId: classroom.id,
        title: "Scanned",
        originalFilename: "scanned.pdf",
        storageKey: `lessons/${classroom.id}/original.pdf`,
        checksum: `scanned-${Math.random()}`,
        sizeBytes: bytes.byteLength,
        pageCount: 1,
        status: "QUEUED",
      },
    });
    await getStorage().put(lesson.storageKey, bytes);

    await expect(extractProcessor.processExtract({ lessonId: lesson.id, stage: "extract", version: 0 })).rejects.toThrow(
      /no selectable text/i,
    );
  });
});
