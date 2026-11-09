import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { prisma as defaultPrisma } from "@/server/db";
import { getStorage, type LocalStorage } from "@/server/storage";
import { generateArtBrief, getArtDirectionProvider, type ArtDirectionProvider } from "./art-direction";
import { renderCharacterLoop, sliceSpriteSheet } from "./character";
import { getImageProvider, type ImageProvider } from "./image";
import { VISUAL_PROMPT_VERSION } from "./image-prompts";

export type VisualLesson = {
  id: string;
  title: string;
  jobVersion: number;
  pages: Array<{ pageNumber: number; text: string }>;
};

export type LessonVisualAssets = {
  scenePath: string;
  characterLoopPath: string;
};

export type EnsureVisualOptions = {
  db?: PrismaClient;
  storage?: LocalStorage;
  provider?: ImageProvider | null;
  artDirectionProvider?: ArtDirectionProvider | null;
  force?: boolean;
};

const inFlight = new Map<string, Promise<LessonVisualAssets | null>>();

type ExistingVisual = {
  status: string;
  jobVersion: number;
  sceneKey: string | null;
  characterSheetKey: string | null;
  characterLoopKey: string | null;
  generationId: string | null;
  promptVersion: string | null;
} | null;

async function recordStart(lesson: VisualLesson, db: PrismaClient): Promise<void> {
  await db.generationJob.upsert({
    where: { lessonId_stage: { lessonId: lesson.id, stage: "VISUAL" } },
    create: { lessonId: lesson.id, stage: "VISUAL", status: "ACTIVE" },
    update: { status: "ACTIVE", error: null },
  });
}

async function recordFailure(
  lesson: VisualLesson,
  db: PrismaClient,
  message: string,
  existing: ExistingVisual,
): Promise<void> {
  const error = message.slice(0, 1_000);
  const keepUsableArt =
    existing?.status === "READY" &&
    existing.jobVersion === lesson.jobVersion &&
    Boolean(existing.sceneKey) &&
    Boolean(existing.characterLoopKey);

  await db.lessonVisual
    .upsert({
      where: { lessonId: lesson.id },
      create: {
        lessonId: lesson.id,
        status: "FAILED",
        jobVersion: lesson.jobVersion,
        promptVersion: VISUAL_PROMPT_VERSION,
        error,
        lastError: error,
      },
      update: keepUsableArt
        ? { lastError: error }
        : {
            status: "FAILED",
            jobVersion: lesson.jobVersion,
            promptVersion: VISUAL_PROMPT_VERSION,
            error,
            lastError: error,
          },
    })
    .catch((dbError) => logger.error({ lessonId: lesson.id, err: dbError }, "could not record visual failure"));

  await db.generationJob
    .upsert({
      where: { lessonId_stage: { lessonId: lesson.id, stage: "VISUAL" } },
      create: { lessonId: lesson.id, stage: "VISUAL", status: "FAILED", error, finishedAt: new Date() },
      update: { status: "FAILED", error, finishedAt: new Date() },
    })
    .catch((dbError) => logger.error({ lessonId: lesson.id, err: dbError }, "could not record visual job failure"));
}

async function generateVisual(
  lesson: VisualLesson,
  db: PrismaClient,
  storage: LocalStorage,
  provider: ImageProvider,
  artDirectionProvider: ArtDirectionProvider | null,
  existing: ExistingVisual,
): Promise<LessonVisualAssets> {
  const generationId = randomUUID();
  const prefix = `lessons/${lesson.id}/visual/${generationId}`;
  const promptInput = {
    title: lesson.title,
    pages: lesson.pages.map((page) => ({ pageNumber: page.pageNumber, text: page.text })),
  };

  const keepUsableArt =
    existing?.status === "READY" &&
    existing.jobVersion === lesson.jobVersion &&
    Boolean(existing.sceneKey) &&
    Boolean(existing.characterLoopKey);

  await recordStart(lesson, db);
  await db.lessonVisual.upsert({
    where: { lessonId: lesson.id },
    create: {
      lessonId: lesson.id,
      status: "GENERATING",
      jobVersion: lesson.jobVersion,
      promptVersion: VISUAL_PROMPT_VERSION,
    },
    update: keepUsableArt
      ? { lastError: null }
      : {
          status: "GENERATING",
          jobVersion: lesson.jobVersion,
          promptVersion: VISUAL_PROMPT_VERSION,
          error: null,
          lastError: null,
        },
  });

  const workDir = await mkdtemp(path.join(os.tmpdir(), "lessonlab-visual-"));
  try {
    const briefResult = await generateArtBrief(promptInput, artDirectionProvider);
    const visualInput = { ...promptInput, brief: briefResult.brief };
    const [scene, sheet] = await Promise.all([
      provider.generateScene(visualInput),
      provider.generateCharacterSheet(visualInput),
    ]);

    const sceneKey = `${prefix}/scene.png`;
    const sheetKey = `${prefix}/character-sheet.png`;
    await storage.put(sceneKey, scene.data);
    await storage.put(sheetKey, sheet.data);

    const frames = await sliceSpriteSheet(storage.getAbsolutePath(sheetKey), path.join(workDir, "frames"));
    const loop = await renderCharacterLoop(frames, workDir);
    const loopKey = `${prefix}/character-loop.${loop.extension}`;
    await storage.putFile(loopKey, loop.path);

    const assets: LessonVisualAssets = {
      scenePath: storage.getAbsolutePath(sceneKey),
      characterLoopPath: storage.getAbsolutePath(loopKey),
    };

    await db.lessonVisual.update({
      where: { lessonId: lesson.id },
      data: {
        status: "READY",
        jobVersion: lesson.jobVersion,
        sceneKey,
        characterSheetKey: sheetKey,
        characterLoopKey: loopKey,
        generationId,
        artBrief: JSON.stringify(briefResult.brief),
        artBriefModel: briefResult.model,
        artBriefFallback: briefResult.fallback,
        model: scene.model,
        imageQuality: getEnv().OPENAI_IMAGE_QUALITY,
        promptVersion: VISUAL_PROMPT_VERSION,
        error: null,
        lastError: null,
      },
    });
    await db.generationJob.upsert({
      where: { lessonId_stage: { lessonId: lesson.id, stage: "VISUAL" } },
      create: {
        lessonId: lesson.id,
        stage: "VISUAL",
        status: "COMPLETED",
        model: scene.model,
        promptVersion: VISUAL_PROMPT_VERSION,
        finishedAt: new Date(),
      },
      update: {
        status: "COMPLETED",
        model: scene.model,
        promptVersion: VISUAL_PROMPT_VERSION,
        error: null,
        finishedAt: new Date(),
      },
    });

    const previousKeys = [
      existing?.sceneKey,
      existing?.characterSheetKey,
      existing?.characterLoopKey,
    ].filter((key): key is string => Boolean(key) && !key!.startsWith(`${prefix}/`));
    for (const key of previousKeys) {
      await storage.delete(key).catch((error) => {
        logger.warn({ lessonId: lesson.id, key, err: error }, "could not delete the previous visual asset");
      });
    }

    return assets;
  } catch (error) {
    await storage.deletePrefix(prefix).catch(() => undefined);
    throw error;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function run(
  lesson: VisualLesson,
  options: EnsureVisualOptions,
): Promise<LessonVisualAssets | null> {
  const db = options.db ?? defaultPrisma;
  const storage = options.storage ?? getStorage();
  const provider = options.provider === undefined ? getImageProvider() : options.provider;
  if (!provider) return null;
  const artDirectionProvider =
    options.artDirectionProvider === undefined ? getArtDirectionProvider() : options.artDirectionProvider;

  const existing = await db.lessonVisual.findUnique({ where: { lessonId: lesson.id } });
  if (
    !options.force &&
    existing?.jobVersion === lesson.jobVersion &&
    existing.promptVersion === VISUAL_PROMPT_VERSION &&
    existing.status === "READY"
  ) {
    const keys = [existing.sceneKey, existing.characterLoopKey].filter((key): key is string => Boolean(key));
    const filesExist =
      keys.length === 2 && (await Promise.all(keys.map((key) => storage.exists(key)))).every(Boolean);
    if (filesExist) {
      return {
        scenePath: storage.getAbsolutePath(existing.sceneKey!),
        characterLoopPath: storage.getAbsolutePath(existing.characterLoopKey!),
      };
    }
  }

  try {
    return await generateVisual(lesson, db, storage, provider, artDirectionProvider ?? null, existing);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Visual generation failed";
    logger.warn({ lessonId: lesson.id, err: error }, "lesson visual generation failed");
    await recordFailure(lesson, db, message, existing);
    return null;
  }
}

export function ensureLessonVisual(
  lesson: VisualLesson,
  options: EnsureVisualOptions = {},
): Promise<LessonVisualAssets | null> {
  const key = `${lesson.id}:${lesson.jobVersion}:${options.force ? "force" : "reuse"}`;
  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = run(lesson, options).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}
