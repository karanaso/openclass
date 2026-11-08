import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { logger } from "@/lib/logger";
import { prisma as defaultPrisma } from "@/server/db";
import { getStorage, type LocalStorage } from "@/server/storage";
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
};

const inFlight = new Map<string, Promise<LessonVisualAssets | null>>();

async function recordFailure(
  lesson: VisualLesson,
  db: PrismaClient,
  message: string,
): Promise<void> {
  const error = message.slice(0, 1_000);
  await db.lessonVisual
    .upsert({
      where: { lessonId: lesson.id },
      create: { lessonId: lesson.id, status: "FAILED", jobVersion: lesson.jobVersion, error },
      update: { status: "FAILED", jobVersion: lesson.jobVersion, error },
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
): Promise<LessonVisualAssets | null> {
  await db.lessonVisual.upsert({
    where: { lessonId: lesson.id },
    create: {
      lessonId: lesson.id,
      status: "GENERATING",
      jobVersion: lesson.jobVersion,
      promptVersion: VISUAL_PROMPT_VERSION,
    },
    update: {
      status: "GENERATING",
      jobVersion: lesson.jobVersion,
      promptVersion: VISUAL_PROMPT_VERSION,
      error: null,
      sceneKey: null,
      characterSheetKey: null,
      characterLoopKey: null,
    },
  });

  const promptInput = {
    title: lesson.title,
    pages: lesson.pages.map((page) => ({ pageNumber: page.pageNumber, text: page.text })),
  };

  const workDir = await mkdtemp(path.join(os.tmpdir(), "lessonlab-visual-"));
  try {
    const [scene, sheet] = await Promise.all([
      provider.generateScene(promptInput),
      provider.generateCharacterSheet(promptInput),
    ]);

    const sceneKey = `lessons/${lesson.id}/visual/scene.png`;
    const sheetKey = `lessons/${lesson.id}/visual/character-sheet.png`;
    await storage.put(sceneKey, scene.data);
    await storage.put(sheetKey, sheet.data);

    const frames = await sliceSpriteSheet(storage.getAbsolutePath(sheetKey), path.join(workDir, "frames"));
    const loop = await renderCharacterLoop(frames, workDir);
    const loopKey = `lessons/${lesson.id}/visual/character-loop.${loop.extension}`;
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
        model: scene.model,
        promptVersion: VISUAL_PROMPT_VERSION,
        error: null,
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

    return assets;
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

  const existing = await db.lessonVisual.findUnique({ where: { lessonId: lesson.id } });
  if (existing?.jobVersion === lesson.jobVersion) {
    if (existing.status !== "READY") {
      return null;
    }
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
    return await generateVisual(lesson, db, storage, provider);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Visual generation failed";
    logger.warn({ lessonId: lesson.id, err: error }, "lesson visual generation failed");
    await recordFailure(lesson, db, message);
    return null;
  }
}

export function ensureLessonVisual(
  lesson: VisualLesson,
  options: EnsureVisualOptions = {},
): Promise<LessonVisualAssets | null> {
  const key = `${lesson.id}:${lesson.jobVersion}`;
  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = run(lesson, options).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}
