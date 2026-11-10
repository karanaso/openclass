import type { PrismaClient } from "@prisma/client";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { prisma as defaultPrisma } from "@/server/db";
import type { ContentProvider, ProviderUsage } from "@/server/generation/provider";
import { getContentProvider } from "@/server/generation/provider-factory";
import { estimateCost } from "@/server/generation/usage";
import { chunkStoryPages } from "./chunking";
import { normalizeStory } from "./normalize";
import { STORY_PROMPT_VERSION } from "./prompts";
import type { RawStory, StoryBeat, StoryPage } from "./schemas";

export type StoredStoryScene = {
  sceneKey: string;
  sourcePages: number[];
  narration: { el: string; en: string };
  visualDirection?: string;
};

export type StoredStory = {
  id: string;
  lessonId: string;
  jobVersion: number;
  title: string;
  logline: string;
  sourceLocale: string;
  scenes: StoredStoryScene[];
};

export type EnsureStoryOptions = {
  db?: PrismaClient;
  provider?: ContentProvider;
  minScenes?: number;
  maxScenes?: number;
  chunkChars?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
  generatingStaleMs?: number;
};

const inFlight = new Map<string, Promise<StoredStory>>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

function toStoredStory(row: {
  id: string;
  lessonId: string;
  jobVersion: number;
  title: string | null;
  logline: string | null;
  sourceLocale: string;
  scenes: Array<{
    sceneKey: string;
    sourcePages: unknown;
    narrationEl: string;
    narrationEn: string;
    visualDirection: string | null;
  }>;
}): StoredStory {
  return {
    id: row.id,
    lessonId: row.lessonId,
    jobVersion: row.jobVersion,
    title: row.title ?? "Lesson story",
    logline: row.logline ?? "",
    sourceLocale: row.sourceLocale,
    scenes: row.scenes.map((scene) => ({
      sceneKey: scene.sceneKey,
      sourcePages: Array.isArray(scene.sourcePages) ? (scene.sourcePages as number[]) : [],
      narration: { el: scene.narrationEl, en: scene.narrationEn },
      ...(scene.visualDirection ? { visualDirection: scene.visualDirection } : {}),
    })),
  };
}

async function findReadyStory(
  lessonId: string,
  jobVersion: number,
  db: PrismaClient,
): Promise<StoredStory | null> {
  const story = await db.lessonStory.findUnique({
    where: { lessonId },
    include: { scenes: { orderBy: { position: "asc" } } },
  });
  if (!story || story.status !== "READY" || story.jobVersion !== jobVersion) return null;
  return toStoredStory(story);
}

async function claimStory(
  lesson: { id: string; jobVersion: number; sourceLocale: string },
  db: PrismaClient,
  staleMs: number,
): Promise<{ status: "ready"; story: StoredStory } | { status: "claimed"; storyId: string } | { status: "busy" }> {
  const ready = await findReadyStory(lesson.id, lesson.jobVersion, db);
  if (ready) return { status: "ready", story: ready };

  const existing = await db.lessonStory.findUnique({ where: { lessonId: lesson.id } });
  if (existing?.status === "GENERATING" && Date.now() - existing.updatedAt.getTime() < staleMs) {
    return { status: "busy" };
  }

  if (!existing) {
    try {
      const created = await db.lessonStory.create({
        data: {
          lessonId: lesson.id,
          jobVersion: lesson.jobVersion,
          status: "GENERATING",
          sourceLocale: lesson.sourceLocale === "el" ? "el" : "en",
        },
      });
      return { status: "claimed", storyId: created.id };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const raced = await db.lessonStory.findUnique({ where: { lessonId: lesson.id } });
      if (raced?.status === "READY" && raced.jobVersion === lesson.jobVersion) {
        const story = await findReadyStory(lesson.id, lesson.jobVersion, db);
        if (story) return { status: "ready", story };
      }
      return { status: "busy" };
    }
  }

  const updated = await db.lessonStory.updateMany({
    where: {
      lessonId: lesson.id,
      OR: [{ status: { not: "GENERATING" } }, { updatedAt: { lt: new Date(Date.now() - staleMs) } }],
    },
    data: {
      status: "GENERATING",
      jobVersion: lesson.jobVersion,
      sourceLocale: lesson.sourceLocale === "el" ? "el" : "en",
      error: null,
    },
  });
  if (updated.count !== 1) return { status: "busy" };
  return { status: "claimed", storyId: existing.id };
}

function toBeats(story: RawStory): StoryBeat[] {
  return story.scenes.map((scene) => ({
    sceneKey: scene.sceneKey,
    sourcePages: scene.sourcePages,
    narration: scene.narration,
    visualDirection: scene.visualDirection,
  }));
}

async function generateStory(input: {
  lesson: { id: string; title: string; jobVersion: number; sourceLocale: string };
  pages: StoryPage[];
  provider: ContentProvider;
  minScenes: number;
  maxScenes: number;
  chunkChars: number;
  maxAttempts: number;
  retryDelayMs: number;
}): Promise<{ story: RawStory; usage: ProviderUsage[]; attempts: number }> {
  const sourceLocale = input.lesson.sourceLocale === "el" ? "el" : "en";
  const chunks = chunkStoryPages(input.pages, input.chunkChars);
  let lastError: unknown = null;
  let lastUsage: ProviderUsage[] = [];

  for (let attempt = 1; attempt <= input.maxAttempts; attempt += 1) {
    const usage: ProviderUsage[] = [];
    try {
      let raw: RawStory;
      if (chunks.length <= 1) {
        const result = await input.provider.story({
          mode: "draft",
          pages: input.pages,
          sourceLocale,
          title: input.lesson.title,
        });
        raw = result.items;
        usage.push(result.usage);
      } else {
        const beats: StoryBeat[] = [];
        for (const [chunkIndex, chunk] of chunks.entries()) {
          const result = await input.provider.story({
            mode: "draft",
            pages: chunk,
            sourceLocale,
            title: input.lesson.title,
          });
          usage.push(result.usage);
          beats.push(
            ...toBeats(result.items).map((beat) => ({
              ...beat,
              sceneKey: `chunk-${chunkIndex + 1}-${beat.sceneKey}`,
            })),
          );
        }
        const merged = await input.provider.story({
          mode: "merge",
          pages: input.pages,
          sourceLocale,
          title: input.lesson.title,
          beats,
        });
        raw = merged.items;
        usage.push(merged.usage);
      }

      let normalized = normalizeStory(raw, input.pages, {
        minScenes: input.minScenes,
        maxScenes: input.maxScenes,
      });
      if (!normalized.ok) {
        const repairPages =
          normalized.missingPageNumbers.length > 0
            ? input.pages.filter((page) => normalized.missingPageNumbers.includes(page.pageNumber))
            : input.pages;
        const repaired = await input.provider.story({
          mode: "repair",
          pages: repairPages,
          sourceLocale,
          title: input.lesson.title,
          existing: raw,
          repairNotes: normalized.errors,
          missingPageNumbers: normalized.missingPageNumbers,
        });
        usage.push(repaired.usage);
        raw = repaired.items;
        normalized = normalizeStory(raw, input.pages, {
          minScenes: input.minScenes,
          maxScenes: input.maxScenes,
        });
      }

      if (!normalized.ok) {
        throw new AppError(
          "invalid_story",
          `Story failed validation: ${normalized.errors.slice(0, 3).join("; ")}`,
          422,
          normalized.errors,
        );
      }

      return { story: raw, usage, attempts: attempt };
    } catch (error) {
      lastError = error;
      lastUsage = usage;
      logger.warn({ lessonId: input.lesson.id, attempt, err: error }, "story generation attempt failed");
      if (attempt < input.maxAttempts) await sleep(input.retryDelayMs * attempt);
    }
  }

  const message = lastError instanceof Error ? lastError.message.slice(0, 1_000) : "Story generation failed";
  throw new AppError("story_generation_failed", message, 422, { usage: lastUsage });
}

async function run(
  lesson: { id: string; title: string; jobVersion: number; sourceLocale: string },
  pages: StoryPage[],
  options: EnsureStoryOptions,
): Promise<StoredStory> {
  const db = options.db ?? defaultPrisma;
  const env = getEnv();
  const minScenes = options.minScenes ?? env.STORY_MIN_SCENES;
  const maxScenes = options.maxScenes ?? env.STORY_MAX_SCENES;
  const chunkChars = options.chunkChars ?? env.STORY_CHUNK_CHARS;
  const maxAttempts = options.maxAttempts ?? env.GENERATION_MAX_ATTEMPTS;
  const retryDelayMs = options.retryDelayMs ?? 1_000;
  const staleMs = options.generatingStaleMs ?? 5 * 60_000;

  const claim = await claimStory(lesson, db, staleMs);
  if (claim.status === "ready") return claim.story;
  if (claim.status === "busy") {
    throw new AppError("story_in_progress", "Story generation is already in progress", 409);
  }

  const provider = options.provider ?? getContentProvider();
  const startedAt = new Date();

  await db.generationJob.upsert({
    where: { lessonId_stage: { lessonId: lesson.id, stage: "STORY" } },
    create: {
      lessonId: lesson.id,
      stage: "STORY",
      status: "ACTIVE",
      attempts: 0,
      model: env.STORY_MODEL ?? env.OPENAI_TEXT_MODEL,
      promptVersion: STORY_PROMPT_VERSION,
      startedAt,
    },
    update: {
      status: "ACTIVE",
      attempts: 0,
      model: env.STORY_MODEL ?? env.OPENAI_TEXT_MODEL,
      promptVersion: STORY_PROMPT_VERSION,
      error: null,
      startedAt,
      finishedAt: null,
    },
  });

  try {
    const result = await generateStory({
      lesson,
      pages,
      provider,
      minScenes,
      maxScenes,
      chunkChars,
      maxAttempts,
      retryDelayMs,
    });

    const normalized = normalizeStory(result.story, pages, { minScenes, maxScenes });
    if (!normalized.ok) {
      throw new AppError("invalid_story", `Story failed validation: ${normalized.errors.slice(0, 3).join("; ")}`, 422);
    }

    const model = result.usage[0]?.model ?? env.STORY_MODEL ?? env.OPENAI_TEXT_MODEL;
    const cost = estimateCost(result.usage);
    const inputTokens = result.usage.reduce((sum, item) => sum + item.inputTokens, 0);
    const outputTokens = result.usage.reduce((sum, item) => sum + item.outputTokens, 0);

    await db.$transaction(async (tx) => {
      await tx.storyScene.deleteMany({ where: { storyId: claim.storyId } });
      await tx.lessonStory.update({
        where: { id: claim.storyId },
        data: {
          status: "READY",
          jobVersion: lesson.jobVersion,
          title: normalized.story.title,
          logline: normalized.story.logline,
          sourceLocale: lesson.sourceLocale === "el" ? "el" : "en",
          model,
          promptVersion: STORY_PROMPT_VERSION,
          error: null,
        },
      });
      if (normalized.story.scenes.length > 0) {
        await tx.storyScene.createMany({
          data: normalized.story.scenes.map((scene) => ({
            storyId: claim.storyId,
            position: scene.position,
            sceneKey: scene.sceneKey,
            sourcePages: scene.sourcePages,
            narrationEl: scene.narration.el,
            narrationEn: scene.narration.en,
            visualDirection: scene.visualDirection ?? null,
          })),
        });
      }
    });

    await db.generationJob.update({
      where: { lessonId_stage: { lessonId: lesson.id, stage: "STORY" } },
      data: {
        status: "COMPLETED",
        attempts: result.attempts,
        model,
        inputTokens,
        outputTokens,
        estimatedCostUsd: cost,
        error: null,
        finishedAt: new Date(),
      },
    });

    const stored = await findReadyStory(lesson.id, lesson.jobVersion, db);
    if (!stored) throw new AppError("story_not_stored", "Story could not be loaded after generation", 500);
    return stored;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1_000) : "Story generation failed";
    await db.lessonStory
      .update({ where: { id: claim.storyId }, data: { status: "FAILED", error: message } })
      .catch((dbError) => logger.error({ lessonId: lesson.id, err: dbError }, "could not mark story failed"));
    await db.generationJob
      .update({
        where: { lessonId_stage: { lessonId: lesson.id, stage: "STORY" } },
        data: { status: "FAILED", attempts: maxAttempts, error: message, finishedAt: new Date() },
      })
      .catch((dbError) => logger.error({ lessonId: lesson.id, err: dbError }, "could not record story failure"));
    throw error;
  }
}

export async function ensureLessonStory(
  lessonId: string,
  options: EnsureStoryOptions = {},
): Promise<StoredStory> {
  const db = options.db ?? defaultPrisma;
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: { pages: { orderBy: { pageNumber: "asc" } } },
  });
  if (!lesson) throw new AppError("not_found", "Lesson not found", 404);
  if (lesson.status === "CANCELLED") throw new AppError("cancelled", "Lesson was cancelled", 409);

  const pages: StoryPage[] = lesson.pages
    .map((page) => ({ pageNumber: page.pageNumber, text: page.text }))
    .filter((page) => page.text.trim().length > 0);
  if (pages.length === 0) {
    throw new AppError("no_text", "No extracted text is available for this lesson", 422);
  }

  const key = `${lessonId}:${lesson.jobVersion}`;
  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = run(
    {
      id: lesson.id,
      title: lesson.title,
      jobVersion: lesson.jobVersion,
      sourceLocale: lesson.sourceLocale,
    },
    pages,
    options,
  ).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}
