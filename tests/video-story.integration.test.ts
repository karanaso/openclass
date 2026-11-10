import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { startTestInfra, type TestInfra } from "./helpers/infra";
import { resetEnvCache } from "@/lib/env";
import type { ContentProvider, StoryGenerationInput } from "@/server/generation/provider";
import { resetStorage } from "@/server/storage";

let infra: TestInfra;
let prisma: PrismaClient;
let storageRoot: string;
let queueModule: typeof import("@/server/queue");
let storyService: typeof import("@/server/story/service");
let storyProcessor: typeof import("@/worker/processors/story");
let videoProcessors: typeof import("@/worker/processors/video");
let resume: typeof import("@/server/video/resume");
let lessonControl: typeof import("@/server/services/lesson-control");
let mockProvider: typeof import("@/server/generation/mock-provider");
let storageModule: typeof import("@/server/storage");
let teacherSession: typeof import("@/server/auth/session");
let shareLinks: typeof import("@/server/services/share-links");
let studentAuth: typeof import("@/server/auth/student");
let videoRoute: typeof import("@/app/api/admin/lessons/[lessonId]/video/route");
let adminMediaRoute: typeof import("@/app/api/admin/lessons/[lessonId]/media/[locale]/[kind]/route");
let studentMediaRoute: typeof import("@/app/api/s/[token]/lessons/[lessonId]/media/[locale]/[kind]/route");

const pages = [
  { pageNumber: 1, text: "Photosynthesis converts light energy into chemical energy in plants." },
  { pageNumber: 2, text: "Cellular respiration releases energy from glucose inside mitochondria." },
  { pageNumber: 3, text: "Together these processes cycle energy through living systems." },
];

async function createLesson(name: string) {
  const classroom = await prisma.class.create({ data: { name } });
  const lesson = await prisma.lesson.create({
    data: {
      classId: classroom.id,
      title: name,
      originalFilename: `${name}.pdf`,
      storageKey: `lessons/${classroom.id}/original.pdf`,
      checksum: `story-${Math.random()}`,
      sizeBytes: 100,
      pageCount: pages.length,
      sourceLocale: "en",
      status: "READY",
    },
  });
  await prisma.lessonPage.createMany({
    data: pages.map((page) => ({ lessonId: lesson.id, pageNumber: page.pageNumber, text: page.text })),
  });
  return lesson;
}

function withStory(
  story: (input: StoryGenerationInput) => ReturnType<ContentProvider["story"]>,
): ContentProvider {
  const base = new mockProvider.MockContentProvider();
  return {
    cards: base.cards.bind(base),
    questions: base.questions.bind(base),
    narration: base.narration.bind(base),
    story,
  };
}

async function queuedStages(lessonId: string): Promise<string[]> {
  const jobs = await queueModule
    .getLessonQueue()
    .getJobs(["waiting", "delayed", "paused", "prioritized", "active"], 0, -1, false);
  return jobs.filter((job) => job.data.lessonId === lessonId).map((job) => job.name);
}

async function removeQueued(lessonId: string) {
  const jobs = await queueModule
    .getLessonQueue()
    .getJobs(["waiting", "delayed", "paused", "prioritized", "active"], 0, -1, false);
  await Promise.all(
    jobs.filter((job) => job.data.lessonId === lessonId).map((job) => job.remove().catch(() => undefined)),
  );
}

beforeAll(async () => {
  infra = await startTestInfra();
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "lessonlab-video-story-"));
  process.env.DATABASE_URL = infra.databaseUrl;
  process.env.REDIS_URL = infra.redisUrl;
  process.env.AUTH_SECRET = "a".repeat(40);
  process.env.TEACHER_PASSWORD = "test";
  process.env.AI_PROVIDER = "mock";
  process.env.TTS_PROVIDER = "mock";
  process.env.VIDEO_PROVIDER = "mock";
  process.env.STORAGE_ROOT = storageRoot;
  process.env.MAX_VIDEO_SECONDS = "900";
  process.env.VIDEO_AI_POLL_INTERVAL_MS = "1";
  process.env.VIDEO_AI_TIMEOUT_SECONDS = "60";
  process.env.GENERATION_MAX_ATTEMPTS = "1";
  resetEnvCache();
  resetStorage();

  const redis = await import("@/server/redis");
  await redis.closeRedis();
  queueModule = await import("@/server/queue");
  await queueModule.closeLessonQueue();
  prisma = (await import("@/server/db")).prisma;
  storyService = await import("@/server/story/service");
  storyProcessor = await import("@/worker/processors/story");
  videoProcessors = await import("@/worker/processors/video");
  resume = await import("@/server/video/resume");
  lessonControl = await import("@/server/services/lesson-control");
  mockProvider = await import("@/server/generation/mock-provider");
  storageModule = await import("@/server/storage");
  teacherSession = await import("@/server/auth/session");
  shareLinks = await import("@/server/services/share-links");
  studentAuth = await import("@/server/auth/student");
  videoRoute = await import("@/app/api/admin/lessons/[lessonId]/video/route");
  adminMediaRoute = await import("@/app/api/admin/lessons/[lessonId]/media/[locale]/[kind]/route");
  studentMediaRoute = await import("@/app/api/s/[token]/lessons/[lessonId]/media/[locale]/[kind]/route");
}, 120_000);

afterAll(async () => {
  await queueModule?.closeLessonQueue();
  const redis = await import("@/server/redis");
  await redis.closeRedis();
  await prisma?.$disconnect();
  await rm(storageRoot, { recursive: true, force: true });
  await infra?.stop();
});

describe("story generation", () => {
  it("generates one bilingual story and reuses it", async () => {
    const lesson = await createLesson("Story reuse");
    const result = await storyService.ensureLessonStory(lesson.id, {
      db: prisma,
      provider: new mockProvider.MockContentProvider(),
      minScenes: 3,
      maxScenes: 20,
      retryDelayMs: 0,
      maxAttempts: 1,
    });

    expect(result.scenes.length).toBeGreaterThanOrEqual(3);
    expect(result.scenes.every((scene) => scene.narration.el && scene.narration.en)).toBe(true);
    const stored = await prisma.lessonStory.findUniqueOrThrow({
      where: { lessonId: lesson.id },
      include: { scenes: true },
    });
    expect(stored.status).toBe("READY");
    expect(stored.scenes.length).toBe(result.scenes.length);
    const job = await prisma.generationJob.findUniqueOrThrow({
      where: { lessonId_stage: { lessonId: lesson.id, stage: "STORY" } },
    });
    expect(job.status).toBe("COMPLETED");
    expect(job.estimatedCostUsd).toBeGreaterThan(0);

    const reused = await storyService.ensureLessonStory(lesson.id, {
      db: prisma,
      provider: withStory(async () => {
        throw new Error("story should be reused");
      }),
      retryDelayMs: 0,
    });
    expect(reused.id).toBe(result.id);
    expect(await prisma.lessonStory.count({ where: { lessonId: lesson.id } })).toBe(1);
  });

  it("coalesces concurrent requests into one story generation", async () => {
    const lesson = await createLesson("Concurrent story");
    const base = new mockProvider.MockContentProvider();
    let calls = 0;
    const provider = withStory(async (input) => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return base.story(input);
    });

    const [first, second] = await Promise.all([
      storyService.ensureLessonStory(lesson.id, { db: prisma, provider, retryDelayMs: 0, maxAttempts: 1 }),
      storyService.ensureLessonStory(lesson.id, { db: prisma, provider, retryDelayMs: 0, maxAttempts: 1 }),
    ]);

    expect(calls).toBe(1);
    expect(first.id).toBe(second.id);
    expect(await prisma.lessonStory.count({ where: { lessonId: lesson.id } })).toBe(1);
  });

  it("rejects a second process while another story generation is fresh", async () => {
    const lesson = await createLesson("Busy story");
    await prisma.lessonStory.create({
      data: {
        lessonId: lesson.id,
        jobVersion: lesson.jobVersion,
        status: "GENERATING",
        sourceLocale: "en",
      },
    });

    await expect(
      storyService.ensureLessonStory(lesson.id, {
        db: prisma,
        provider: new mockProvider.MockContentProvider(),
        retryDelayMs: 0,
        maxAttempts: 1,
      }),
    ).rejects.toMatchObject({ code: "story_in_progress" });
  });

  it("uses chunk drafts plus one merge pass for a long lesson", async () => {
    const lesson = await createLesson("Long story");
    const base = new mockProvider.MockContentProvider();
    const modes: string[] = [];
    await storyService.ensureLessonStory(lesson.id, {
      db: prisma,
      provider: withStory(async (input) => {
        modes.push(input.mode);
        return base.story(input);
      }),
      minScenes: 3,
      maxScenes: 20,
      chunkChars: 80,
      retryDelayMs: 0,
      maxAttempts: 1,
    });

    expect(modes.filter((mode) => mode === "draft").length).toBeGreaterThan(1);
    expect(modes).toContain("merge");
    const story = await prisma.lessonStory.findUniqueOrThrow({
      where: { lessonId: lesson.id },
      include: { scenes: true },
    });
    expect(story.status).toBe("READY");
    const cited = new Set(story.scenes.flatMap((scene) => scene.sourcePages as number[]));
    expect(cited).toEqual(new Set([1, 2, 3]));
  });

  it("repairs missing pages once and stores the corrected story", async () => {
    const lesson = await createLesson("Repair story");
    const base = new mockProvider.MockContentProvider();
    const valid = await base.story({ mode: "draft", pages, sourceLocale: "en", title: lesson.title });
    const calls: string[] = [];
    await storyService.ensureLessonStory(lesson.id, {
      db: prisma,
      provider: withStory(async (input) => {
        calls.push(input.mode);
        if (input.mode === "draft") {
          return {
            items: {
              ...valid.items,
              scenes: valid.items.scenes.filter((scene) => !scene.sourcePages.includes(3)),
            },
            usage: { model: "fake", inputTokens: 1, outputTokens: 1 },
          };
        }
        return { items: valid.items, usage: { model: "fake", inputTokens: 1, outputTokens: 1 } };
      }),
      minScenes: 3,
      maxScenes: 20,
      retryDelayMs: 0,
      maxAttempts: 1,
    });

    expect(calls).toEqual(["draft", "repair"]);
    const story = await prisma.lessonStory.findUniqueOrThrow({ where: { lessonId: lesson.id } });
    expect(story.status).toBe("READY");
  });

  it("invalidates the story when new content is published", async () => {
    const lesson = await createLesson("Invalidate story");
    await storyService.ensureLessonStory(lesson.id, {
      db: prisma,
      provider: new mockProvider.MockContentProvider(),
      retryDelayMs: 0,
      maxAttempts: 1,
    });
    expect(await prisma.lessonStory.count({ where: { lessonId: lesson.id } })).toBe(1);

    const { publishArtifacts } = await import("@/server/repositories/publication");
    await publishArtifacts(
      lesson.id,
      {
        cards: [
          {
            itemKey: "card-1",
            position: 0,
            sourcePage: 1,
            prompt: { el: "Ερώτηση", en: "Question" },
            answer: { el: "Απάντηση", en: "Answer" },
          },
        ],
        questionnaire: [],
        game: [],
      },
      prisma,
    );
    expect(await prisma.lessonStory.count({ where: { lessonId: lesson.id } })).toBe(0);
  });
});

describe("story and provider processors", () => {
  it("marks only the requested variant failed when story generation fails", async () => {
    const lesson = await createLesson("Story failure isolation");
    await prisma.videoAsset.createMany({
      data: [
        { lessonId: lesson.id, locale: "el", status: "READY", storageKey: `lessons/${lesson.id}/video/el.mp4` },
        { lessonId: lesson.id, locale: "en", status: "READY", storageKey: `lessons/${lesson.id}/video/en.mp4` },
      ],
    });

    await storyProcessor.processStory(
      { lessonId: lesson.id, stage: "story", version: lesson.jobVersion, locale: "el", runId: "fail-el" },
      {
        db: prisma,
        provider: withStory(async () => {
          throw new Error("story provider unavailable");
        }),
      },
    );

    const el = await prisma.videoAsset.findUniqueOrThrow({
      where: { lessonId_locale: { lessonId: lesson.id, locale: "el" } },
    });
    const en = await prisma.videoAsset.findUniqueOrThrow({
      where: { lessonId_locale: { lessonId: lesson.id, locale: "en" } },
    });
    expect(el.status).toBe("FAILED");
    expect(el.error).toMatch(/story provider unavailable/);
    expect(en.status).toBe("READY");
    expect((await prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } })).status).toBe("READY");
    const story = await prisma.lessonStory.findUniqueOrThrow({ where: { lessonId: lesson.id } });
    expect(story.status).toBe("FAILED");
  });

  it("chains story generation into provider submission and reuses the story for the other locale", async () => {
    const lesson = await createLesson("Story chaining");
    await storyProcessor.processStory(
      { lessonId: lesson.id, stage: "story", version: lesson.jobVersion, locale: "el", runId: "el-1" },
      { db: prisma, provider: new mockProvider.MockContentProvider() },
    );

    expect(await queuedStages(lesson.id)).toEqual(["video-submit"]);
    const video = await prisma.videoAsset.findUniqueOrThrow({
      where: { lessonId_locale: { lessonId: lesson.id, locale: "el" } },
    });
    expect(video.status).toBe("PENDING");

    await storyProcessor.processStory(
      { lessonId: lesson.id, stage: "story", version: lesson.jobVersion, locale: "en", runId: "en-1" },
      {
        db: prisma,
        provider: withStory(async () => {
          throw new Error("story should be reused");
        }),
      },
    );
    expect((await queuedStages(lesson.id)).sort()).toEqual(["video-submit", "video-submit"]);
    await removeQueued(lesson.id);
  });

  it("rejects submission without a current story, duplicate active jobs, and provider failures", async () => {
    const missing = await createLesson("Submit missing story");
    await prisma.videoAsset.create({ data: { lessonId: missing.id, locale: "el", status: "PENDING" } });
    await videoProcessors.processVideoSubmit(
      { lessonId: missing.id, stage: "video-submit", version: missing.jobVersion, locale: "el", runId: "missing" },
      { db: prisma, enqueue: false },
    );
    expect(
      (
        await prisma.videoAsset.findUniqueOrThrow({
          where: { lessonId_locale: { lessonId: missing.id, locale: "el" } },
        })
      ).status,
    ).toBe("FAILED");

    const active = await createLesson("Submit duplicate");
    await prisma.videoAsset.create({
      data: {
        lessonId: active.id,
        locale: "el",
        status: "RENDERING",
        providerJobId: "already-running",
        contentVersion: active.jobVersion,
      },
    });
    const submit = vi.fn();
    await videoProcessors.processVideoSubmit(
      { lessonId: active.id, stage: "video-submit", version: active.jobVersion, locale: "el", runId: "duplicate" },
      {
        db: prisma,
        enqueue: false,
        provider: {
          name: "fake",
          submit,
          getJob: async () => ({ id: "already-running", status: "processing" }),
          download: async () => ({ body: new Uint8Array(), contentType: null }),
        },
      },
    );
    expect(submit).not.toHaveBeenCalled();
    expect(
      (
        await prisma.videoAsset.findUniqueOrThrow({
          where: { lessonId_locale: { lessonId: active.id, locale: "el" } },
        })
      ).providerJobId,
    ).toBe("already-running");

    const stale = await createLesson("Submit stale story");
    await prisma.lesson.update({ where: { id: stale.id }, data: { jobVersion: 2 } });
    await prisma.lessonStory.create({
      data: {
        lessonId: stale.id,
        jobVersion: 1,
        status: "READY",
        title: "Old story",
        logline: "Old",
        sourceLocale: "en",
      },
    });
    await prisma.videoAsset.create({ data: { lessonId: stale.id, locale: "el", status: "PENDING" } });
    await videoProcessors.processVideoSubmit(
      { lessonId: stale.id, stage: "video-submit", version: 2, locale: "el", runId: "stale" },
      { db: prisma, enqueue: false },
    );
    expect(
      (
        await prisma.videoAsset.findUniqueOrThrow({
          where: { lessonId_locale: { lessonId: stale.id, locale: "el" } },
        })
      ).status,
    ).toBe("FAILED");

    const failing = await createLesson("Submit provider failure");
    await prisma.lessonStory.create({
      data: {
        lessonId: failing.id,
        jobVersion: failing.jobVersion,
        status: "READY",
        title: "Story",
        logline: "Logline",
        sourceLocale: "en",
      },
    });
    await prisma.videoAsset.create({ data: { lessonId: failing.id, locale: "el", status: "PENDING" } });
    await videoProcessors.processVideoSubmit(
      { lessonId: failing.id, stage: "video-submit", version: failing.jobVersion, locale: "el", runId: "failing" },
      {
        db: prisma,
        enqueue: false,
        provider: {
          name: "fake",
          submit: async () => {
            throw new Error("provider submit exploded");
          },
          getJob: async () => ({ id: "job", status: "failed" }),
          download: async () => ({ body: new Uint8Array(), contentType: null }),
        },
      },
    );
    const failed = await prisma.videoAsset.findUniqueOrThrow({
      where: { lessonId_locale: { lessonId: failing.id, locale: "el" } },
    });
    expect(failed.status).toBe("FAILED");
    expect(failed.error).toMatch(/provider submit exploded/);
  });

  it("submits a story to the provider and ingests a completed video", async () => {
    const lesson = await createLesson("Provider lifecycle");
    await storyService.ensureLessonStory(lesson.id, {
      db: prisma,
      provider: new mockProvider.MockContentProvider(),
      retryDelayMs: 0,
      maxAttempts: 1,
    });
    await prisma.videoAsset.create({ data: { lessonId: lesson.id, locale: "el", status: "PENDING" } });

    await videoProcessors.processVideoSubmit(
      { lessonId: lesson.id, stage: "video-submit", version: lesson.jobVersion, locale: "el", runId: "submit-1" },
      { db: prisma, enqueue: false },
    );
    const submitted = await prisma.videoAsset.findUniqueOrThrow({
      where: { lessonId_locale: { lessonId: lesson.id, locale: "el" } },
    });
    expect(submitted.status).toBe("RENDERING");
    expect(submitted.provider).toBe("mock");
    expect(submitted.providerJobId).toBeTruthy();
    expect(submitted.idempotencyKey).toBe(`${lesson.id}:el:${lesson.jobVersion}:submit-1`);

    await videoProcessors.processVideoPoll(
      { lessonId: lesson.id, stage: "video-poll", version: lesson.jobVersion, locale: "el", runId: "poll-1" },
      { db: prisma, storage: storageModule.getStorage(), enqueue: false },
    );

    const ready = await prisma.videoAsset.findUniqueOrThrow({
      where: { lessonId_locale: { lessonId: lesson.id, locale: "el" } },
    });
    expect(ready.status).toBe("READY");
    expect(ready.progress).toBe(100);
    expect(ready.durationMs).toBeGreaterThan(0);
    expect(ready.storageKey).toBe(`lessons/${lesson.id}/video/el.mp4`);
    expect(await storageModule.getStorage().exists(ready.storageKey!)).toBe(true);
    expect(await storageModule.getStorage().exists(ready.captionsKey!)).toBe(true);
    expect(await storageModule.getStorage().exists(ready.posterKey!)).toBe(true);
  });

  it("keeps polling while the provider is still processing", async () => {
    const lesson = await createLesson("Provider processing");
    await prisma.videoAsset.create({
      data: {
        lessonId: lesson.id,
        locale: "el",
        status: "RENDERING",
        providerJobId: "job-processing",
        contentVersion: lesson.jobVersion,
        submittedAt: new Date(),
      },
    });

    await videoProcessors.processVideoPoll(
      { lessonId: lesson.id, stage: "video-poll", version: lesson.jobVersion, locale: "el", runId: "poll-processing" },
      {
        db: prisma,
        storage: storageModule.getStorage(),
        provider: {
          name: "fake",
          submit: async () => ({ id: "job-processing", status: "queued" }),
          getJob: async () => ({ id: "job-processing", status: "processing", progress: 25 }),
          download: async () => ({ body: new Uint8Array(), contentType: null }),
        },
      },
    );

    const video = await prisma.videoAsset.findUniqueOrThrow({
      where: { lessonId_locale: { lessonId: lesson.id, locale: "el" } },
    });
    expect(video.status).toBe("RENDERING");
    expect(video.providerStatus).toBe("processing");
    expect(video.progress).toBe(25);
    expect(await queuedStages(lesson.id)).toEqual(["video-poll"]);
    await removeQueued(lesson.id);
  });

  it("keeps previous media when a provider poll fails", async () => {
    const lesson = await createLesson("Provider failure");
    await prisma.lessonStory.create({
      data: {
        lessonId: lesson.id,
        jobVersion: lesson.jobVersion,
        status: "READY",
        title: "Story",
        logline: "Logline",
        sourceLocale: "en",
      },
    });
    await prisma.videoAsset.create({
      data: {
        lessonId: lesson.id,
        locale: "el",
        status: "RENDERING",
        storageKey: `lessons/${lesson.id}/video/el.mp4`,
        providerJobId: "job-failed",
        contentVersion: lesson.jobVersion,
        submittedAt: new Date(),
      },
    });

    await videoProcessors.processVideoPoll(
      { lessonId: lesson.id, stage: "video-poll", version: lesson.jobVersion, locale: "el", runId: "poll-fail" },
      {
        db: prisma,
        storage: storageModule.getStorage(),
        enqueue: false,
        provider: {
          name: "fake",
          submit: async () => ({ id: "job", status: "queued" }),
          getJob: async () => ({ id: "job-failed", status: "failed", error: "provider exploded" }),
          download: async () => ({ body: new Uint8Array(), contentType: null }),
        },
      },
    );

    const video = await prisma.videoAsset.findUniqueOrThrow({
      where: { lessonId_locale: { lessonId: lesson.id, locale: "el" } },
    });
    expect(video.status).toBe("FAILED");
    expect(video.error).toMatch(/provider exploded/);
    expect(video.storageKey).toBe(`lessons/${lesson.id}/video/el.mp4`);
  });

  it("times out and rejects stale provider jobs", async () => {
    const lesson = await createLesson("Provider timeout");
    await prisma.videoAsset.create({
      data: {
        lessonId: lesson.id,
        locale: "el",
        status: "RENDERING",
        providerJobId: "job-timeout",
        contentVersion: lesson.jobVersion,
        submittedAt: new Date(Date.now() - 120_000),
      },
    });
    await videoProcessors.processVideoPoll(
      { lessonId: lesson.id, stage: "video-poll", version: lesson.jobVersion, locale: "el", runId: "poll-timeout" },
      { db: prisma, storage: storageModule.getStorage(), enqueue: false },
    );
    let video = await prisma.videoAsset.findUniqueOrThrow({
      where: { lessonId_locale: { lessonId: lesson.id, locale: "el" } },
    });
    expect(video.status).toBe("FAILED");
    expect(video.error).toMatch(/timed out/);

    const stale = await createLesson("Stale provider version");
    await prisma.videoAsset.create({
      data: {
        lessonId: stale.id,
        locale: "el",
        status: "RENDERING",
        providerJobId: "job-stale",
        contentVersion: stale.jobVersion + 1,
        submittedAt: new Date(),
      },
    });
    await videoProcessors.processVideoPoll(
      { lessonId: stale.id, stage: "video-poll", version: stale.jobVersion, locale: "el", runId: "poll-stale" },
      { db: prisma, storage: storageModule.getStorage(), enqueue: false },
    );
    video = await prisma.videoAsset.findUniqueOrThrow({
      where: { lessonId_locale: { lessonId: stale.id, locale: "el" } },
    });
    expect(video.status).toBe("FAILED");
    expect(video.error).toMatch(/content changed/);
  });

  it("resumes active provider jobs on worker startup", async () => {
    const lesson = await createLesson("Resume jobs");
    await prisma.videoAsset.createMany({
      data: [
        {
          lessonId: lesson.id,
          locale: "el",
          status: "RENDERING",
          providerJobId: "job-active",
          contentVersion: lesson.jobVersion,
        },
        { lessonId: lesson.id, locale: "en", status: "PENDING" },
      ],
    });

    const count = await resume.resumeVideoJobs(prisma);
    expect(count).toBeGreaterThanOrEqual(2);
    expect((await queuedStages(lesson.id)).sort()).toEqual(["story", "video-poll"]);
    await removeQueued(lesson.id);
  });
});

describe("video routes", () => {
  it("queues story generation, rejects duplicates, and validates the lesson", async () => {
    const lesson = await createLesson("Video route");
    const cookie = await teacherSession.createSessionToken();
    const endpoint = `http://localhost:3000/api/admin/lessons/${lesson.id}/video`;
    const request = () =>
      new Request(endpoint, {
        method: "POST",
        headers: {
          cookie: `teacher_session=${cookie}`,
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ locale: "el" }),
      });

    const queued = await videoRoute.POST(request(), { params: Promise.resolve({ lessonId: lesson.id }) });
    expect(queued.status).toBe(202);
    expect(await queuedStages(lesson.id)).toEqual(["story"]);
    await removeQueued(lesson.id);

    await prisma.videoAsset.upsert({
      where: { lessonId_locale: { lessonId: lesson.id, locale: "el" } },
      create: { lessonId: lesson.id, locale: "el", status: "PENDING" },
      update: { status: "PENDING" },
    });
    const duplicate = await videoRoute.POST(request(), { params: Promise.resolve({ lessonId: lesson.id }) });
    expect(duplicate.status).toBe(409);

    await prisma.lesson.update({ where: { id: lesson.id }, data: { status: "CANCELLED" } });
    const cancelled = await videoRoute.POST(request(), { params: Promise.resolve({ lessonId: lesson.id }) });
    expect(cancelled.status).toBe(409);

    const emptyClass = await prisma.class.create({ data: { name: "Empty video route" } });
    const empty = await prisma.lesson.create({
      data: {
        classId: emptyClass.id,
        title: "Empty",
        originalFilename: "empty.pdf",
        storageKey: "lessons/empty/original.pdf",
        checksum: `empty-${Math.random()}`,
        sizeBytes: 1,
        status: "READY",
      },
    });
    const noPages = await videoRoute.POST(request(), { params: Promise.resolve({ lessonId: empty.id }) });
    expect(noPages.status).toBe(422);
  });

  it("serves existing media for processing or failed variants", async () => {
    const lesson = await createLesson("Video media route");
    const cookie = await teacherSession.createSessionToken();
    const videoKey = `lessons/${lesson.id}/video/el.mp4`;
    const captionsKey = `lessons/${lesson.id}/video/el.vtt`;
    const posterKey = `lessons/${lesson.id}/video/el.jpg`;
    await storageModule.getStorage().put(videoKey, "video-bytes");
    await storageModule.getStorage().put(captionsKey, "WEBVTT");
    await storageModule.getStorage().put(posterKey, "image-bytes");
    await prisma.videoAsset.create({
      data: { lessonId: lesson.id, locale: "el", status: "RENDERING", storageKey: videoKey, captionsKey, posterKey },
    });

    const params = (locale: string, kind: string) => ({
      params: Promise.resolve({ lessonId: lesson.id, locale, kind }),
    });
    const unauthorized = await adminMediaRoute.GET(
      new Request(`http://localhost:3000/api/admin/lessons/${lesson.id}/media/el/video`),
      params("el", "video"),
    );
    expect(unauthorized.status).toBe(401);

    const playing = await adminMediaRoute.GET(
      new Request(`http://localhost:3000/api/admin/lessons/${lesson.id}/media/el/video`, {
        headers: { cookie: `teacher_session=${cookie}` },
      }),
      params("el", "video"),
    );
    expect(playing.status).toBe(200);
    expect(playing.headers.get("content-type")).toContain("video/mp4");

    await prisma.videoAsset.update({
      where: { lessonId_locale: { lessonId: lesson.id, locale: "el" } },
      data: { status: "FAILED", error: "provider failed" },
    });
    const afterFailure = await adminMediaRoute.GET(
      new Request(`http://localhost:3000/api/admin/lessons/${lesson.id}/media/el/video`, {
        headers: { cookie: `teacher_session=${cookie}` },
      }),
      params("el", "video"),
    );
    expect(afterFailure.status).toBe(200);

    const missing = await adminMediaRoute.GET(
      new Request(`http://localhost:3000/api/admin/lessons/${lesson.id}/media/en/video`, {
        headers: { cookie: `teacher_session=${cookie}` },
      }),
      params("en", "video"),
    );
    expect(missing.status).toBe(404);

    const share = await shareLinks.createShareLink({ lessonId: lesson.id });
    const studentToken = await studentAuth.createStudentSessionToken({
      name: "Student",
      normalizedName: "student",
      tokenHash: shareLinks.hashShareToken(share.token),
    });
    const studentPlaying = await studentMediaRoute.GET(
      new Request(`http://localhost:3000/api/s/${share.token}/lessons/${lesson.id}/media/el/video`, {
        headers: { cookie: `student_session=${studentToken}` },
      }),
      {
        params: Promise.resolve({ token: share.token, lessonId: lesson.id, locale: "el", kind: "video" }),
      },
    );
    expect(studentPlaying.status).toBe(200);
  });
});

describe("cleanup", () => {
  it("removes stories and new-stage jobs when a lesson is cancelled", async () => {
    const lesson = await createLesson("Cleanup story");
    await prisma.lessonStory.create({
      data: {
        lessonId: lesson.id,
        jobVersion: lesson.jobVersion,
        status: "READY",
        title: "Story",
        logline: "Logline",
        sourceLocale: "en",
      },
    });
    await prisma.videoAsset.create({ data: { lessonId: lesson.id, locale: "el", status: "PENDING" } });
    await queueModule.enqueueStage({
      lessonId: lesson.id,
      stage: "story",
      version: lesson.jobVersion,
      locale: "el",
      runId: "cancel-story",
    });
    await queueModule.enqueueStage({
      lessonId: lesson.id,
      stage: "video-poll",
      version: lesson.jobVersion,
      locale: "el",
      runId: "cancel-poll",
    });

    await lessonControl.cancelLesson(lesson.id, prisma, storageModule.getStorage());
    expect(await prisma.lessonStory.count({ where: { lessonId: lesson.id } })).toBe(0);
    expect(await prisma.videoAsset.count({ where: { lessonId: lesson.id } })).toBe(0);
    expect(await queuedStages(lesson.id)).toEqual([]);
  });
});
