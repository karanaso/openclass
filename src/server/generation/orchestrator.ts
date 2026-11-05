import type { PrismaClient } from "@prisma/client";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { prisma as defaultPrisma } from "@/server/db";
import { enqueueStage } from "@/server/queue";
import { publishArtifacts } from "@/server/repositories/publication";
import { setLessonStatus } from "@/server/repositories/lesson-status";
import { chunkPages, PROMPT_VERSION } from "./prompts";
import { getContentProvider } from "./provider-factory";
import type { ContentProvider, GenerationInput, ProviderUsage } from "./provider";
import type { ContentCounts, PromptPage, RawCard, RawNarration, RawQuestion } from "./schemas";
import { validateGeneratedArtifacts, type RawArtifacts } from "./validate";
import type { GeneratedArtifacts } from "./types";

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
};

function estimateCost(usage: ProviderUsage[]): number {
  return usage.reduce((total, item) => {
    const price = MODEL_PRICING[item.model] ?? { input: 1, output: 4 };
    return total + (item.inputTokens / 1_000_000) * price.input + (item.outputTokens / 1_000_000) * price.output;
  }, 0);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type GenerateOptions = {
  provider?: ContentProvider;
  db?: PrismaClient;
  maxAttempts?: number;
  retryDelayMs?: number;
  continueToMedia?: boolean;
};

export type GenerationResult = {
  artifacts: GeneratedArtifacts;
  usage: ProviderUsage[];
  estimatedCostUsd: number;
};

export async function generateLessonContent(lessonId: string, options: GenerateOptions = {}): Promise<GenerationResult> {
  const db = options.db ?? defaultPrisma;
  const env = getEnv();
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: { pages: { orderBy: { pageNumber: "asc" } } },
  });
  if (!lesson) throw new AppError("not_found", "Lesson not found", 404);
  if (lesson.status === "CANCELLED") {
    throw new AppError("cancelled", "Lesson was cancelled", 409);
  }

  const pages: PromptPage[] = lesson.pages
    .map((page) => ({ pageNumber: page.pageNumber, text: page.text }))
    .filter((page) => page.text.trim().length > 0);
  if (pages.length === 0) {
    throw new AppError("no_text", "No extracted text is available for this lesson", 422);
  }

  const counts: ContentCounts = {
    cards: { min: env.CARD_MIN, max: env.CARD_MAX },
    questionnaire: { min: env.QUESTIONNAIRE_MIN, max: env.QUESTIONNAIRE_MAX },
    game: { min: env.GAME_MIN, max: env.GAME_MAX },
  };
  const provider = options.provider ?? getContentProvider();
  const maxAttempts = options.maxAttempts ?? env.GENERATION_MAX_ATTEMPTS;
  const retryDelayMs = options.retryDelayMs ?? 1000;
  const chunks = chunkPages(pages);

  await setLessonStatus(lessonId, "GENERATING", {}, db);
  await db.generationJob.upsert({
    where: { lessonId_stage: { lessonId, stage: "GENERATE" } },
    create: {
      lessonId,
      stage: "GENERATE",
      status: "ACTIVE",
      attempts: 0,
      model: env.OPENAI_TEXT_MODEL,
      promptVersion: PROMPT_VERSION,
      startedAt: new Date(),
    },
    update: {
      status: "ACTIVE",
      error: null,
      startedAt: new Date(),
      finishedAt: null,
    },
  });

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const usage: ProviderUsage[] = [];
    try {
      const cards: RawCard[] = [];
      const questionnaire: RawQuestion[] = [];
      const game: RawQuestion[] = [];
      const narration: RawNarration[] = [];

      const perChunk: ContentCounts = {
        cards: {
          min: Math.max(1, Math.ceil(counts.cards.min / chunks.length)),
          max: Math.max(1, Math.ceil(counts.cards.max / chunks.length)),
        },
        questionnaire: {
          min: Math.max(1, Math.ceil(counts.questionnaire.min / chunks.length)),
          max: Math.max(1, Math.ceil(counts.questionnaire.max / chunks.length)),
        },
        game: {
          min: Math.max(1, Math.ceil(counts.game.min / chunks.length)),
          max: Math.max(1, Math.ceil(counts.game.max / chunks.length)),
        },
      };

      for (const chunk of chunks) {
        const input: GenerationInput = {
          kind: "cards",
          pages: chunk,
          counts: perChunk,
          sourceLocale: lesson.sourceLocale as "el" | "en",
        };
        const cardResult = await provider.cards(input);
        cards.push(...cardResult.items);
        usage.push(cardResult.usage);

        const questionnaireResult = await provider.questions(input, "questionnaire");
        questionnaire.push(...questionnaireResult.items);
        usage.push(questionnaireResult.usage);

        const gameResult = await provider.questions(input, "game");
        game.push(...gameResult.items);
        usage.push(gameResult.usage);

        const narrationResult = await provider.narration(input);
        narration.push(...narrationResult.items);
        usage.push(narrationResult.usage);
      }

      const raw: RawArtifacts = {
        cards: cards.slice(0, counts.cards.max),
        questionnaire: questionnaire.slice(0, counts.questionnaire.max),
        game: game.slice(0, counts.game.max),
        narration,
      };
      const artifacts = validateGeneratedArtifacts(raw, pages, counts);
      const cost = estimateCost(usage);
      const inputTokens = usage.reduce((sum, item) => sum + item.inputTokens, 0);
      const outputTokens = usage.reduce((sum, item) => sum + item.outputTokens, 0);

      await publishArtifacts(lessonId, artifacts, db);
      await db.generationJob.update({
        where: { lessonId_stage: { lessonId, stage: "GENERATE" } },
        data: {
          status: "COMPLETED",
          attempts: attempt,
          model: usage[0]?.model ?? env.OPENAI_TEXT_MODEL,
          inputTokens,
          outputTokens,
          estimatedCostUsd: cost,
          finishedAt: new Date(),
          error: null,
        },
      });

      if (options.continueToMedia) {
        await setLessonStatus(lessonId, "RENDERING", {}, db);
        try {
          await enqueueStage({ lessonId, stage: "tts", version: lesson.jobVersion });
        } catch (error) {
          logger.error({ lessonId, err: error }, "could not queue speech synthesis");
          await setLessonStatus(lessonId, "READY", {}, db);
        }
      }

      return { artifacts, usage, estimatedCostUsd: cost };
    } catch (error) {
      lastError = error;
      logger.warn({ lessonId, attempt, maxAttempts, err: error }, "content generation attempt failed");
      if (attempt < maxAttempts) {
        await sleep(retryDelayMs * attempt);
      }
    }
  }

  const message = lastError instanceof Error ? lastError.message.slice(0, 1000) : "Content generation failed";
  await db.generationJob.update({
    where: { lessonId_stage: { lessonId, stage: "GENERATE" } },
    data: {
      status: "FAILED",
      attempts: maxAttempts,
      error: message,
      finishedAt: new Date(),
    },
  });
  await setLessonStatus(lessonId, "FAILED", { failureReason: message }, db);
  throw lastError instanceof Error ? lastError : new AppError("generation_failed", message, 500);
}
