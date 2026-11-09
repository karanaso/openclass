import type { PrismaClient } from "@prisma/client";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { prisma as defaultPrisma } from "@/server/db";
import { normalizeNarration } from "./narration";
import { PROMPT_VERSION } from "./prompts";
import { getContentProvider } from "./provider-factory";
import type { ContentProvider, ProviderUsage } from "./provider";
import type { ContentCounts, PromptPage, RawNarration } from "./schemas";
import { estimateCost } from "./usage";

export type EnsureNarrationOptions = {
  db?: PrismaClient;
  provider?: ContentProvider;
  counts?: ContentCounts;
};

export type NarrationPreparationResult = {
  preparedPages: number[];
  reused: boolean;
  model: string;
  usage: ProviderUsage[];
  estimatedCostUsd: number;
};

const inFlight = new Map<string, Promise<NarrationPreparationResult>>();

function contentCounts(): ContentCounts {
  const env = getEnv();
  return {
    cards: { min: env.CARD_MIN, max: env.CARD_MAX },
    questionnaire: { min: env.QUESTIONNAIRE_MIN, max: env.QUESTIONNAIRE_MAX },
    game: { min: env.GAME_MIN, max: env.GAME_MAX },
  };
}

async function requestNarration(
  provider: ContentProvider,
  pages: PromptPage[],
  counts: ContentCounts,
  sourceLocale: "el" | "en",
): Promise<{ segments: Map<number, RawNarration>; usage: ProviderUsage }> {
  const result = await provider.narration({ kind: "narration", pages, counts, sourceLocale });
  const normalized = normalizeNarration(result.items, pages);
  if (normalized.dropped.count > 0) {
    logger.warn(
      { dropped: normalized.dropped.count, pageNumbers: normalized.dropped.pageNumbers },
      "dropped duplicate or out-of-scope narration segments",
    );
  }
  return {
    segments: new Map(normalized.segments.map((segment) => [segment.pageNumber, segment])),
    usage: result.usage,
  };
}

export type NarrationPassResult = {
  segments: Map<number, RawNarration>;
  usage: ProviderUsage[];
  attempts: number;
  unresolvedPageNumbers: number[];
};

export async function prepareNarrationForPages(
  provider: ContentProvider,
  pages: PromptPage[],
  counts: ContentCounts,
  sourceLocale: "el" | "en",
): Promise<NarrationPassResult> {
  const first = await requestNarration(provider, pages, counts, sourceLocale);
  const segments = new Map(first.segments);
  const usage = [first.usage];
  let attempts = 1;

  const stillMissing = pages.filter((page) => !segments.has(page.pageNumber));
  if (stillMissing.length > 0) {
    const repair = await requestNarration(provider, stillMissing, counts, sourceLocale);
    attempts += 1;
    usage.push(repair.usage);
    for (const [pageNumber, segment] of repair.segments) {
      segments.set(pageNumber, segment);
    }
  }

  return {
    segments,
    usage,
    attempts,
    unresolvedPageNumbers: pages
      .filter((page) => !segments.has(page.pageNumber))
      .map((page) => page.pageNumber),
  };
}

async function run(
  lesson: { id: string; jobVersion: number; sourceLocale: string },
  pages: PromptPage[],
  options: EnsureNarrationOptions,
): Promise<NarrationPreparationResult> {
  const db = options.db ?? defaultPrisma;
  const existing = await db.narrationSegment.findMany({
    where: { lessonId: lesson.id },
    select: { pageNumber: true, locale: true },
  });
  const localesByPage = new Map<number, Set<string>>();
  for (const segment of existing) {
    const locales = localesByPage.get(segment.pageNumber) ?? new Set<string>();
    locales.add(segment.locale);
    localesByPage.set(segment.pageNumber, locales);
  }

  const missingPages = pages.filter((page) => {
    const locales = localesByPage.get(page.pageNumber);
    return !locales?.has("el") || !locales.has("en");
  });
  if (missingPages.length === 0) {
    return { preparedPages: [], reused: true, model: getEnv().OPENAI_TEXT_MODEL, usage: [], estimatedCostUsd: 0 };
  }

  const env = getEnv();
  const provider = options.provider ?? getContentProvider();
  const counts = options.counts ?? contentCounts();
  const sourceLocale = lesson.sourceLocale === "el" ? "el" : "en";
  const startedAt = new Date();

  await db.generationJob.upsert({
    where: { lessonId_stage: { lessonId: lesson.id, stage: "NARRATION" } },
    create: {
      lessonId: lesson.id,
      stage: "NARRATION",
      status: "ACTIVE",
      attempts: 0,
      model: env.OPENAI_TEXT_MODEL,
      promptVersion: PROMPT_VERSION,
      startedAt,
    },
    update: {
      status: "ACTIVE",
      attempts: 0,
      model: env.OPENAI_TEXT_MODEL,
      promptVersion: PROMPT_VERSION,
      error: null,
      startedAt,
      finishedAt: null,
    },
  });

  let attempts = 0;
  try {
    const preparedResult = await prepareNarrationForPages(provider, missingPages, counts, sourceLocale);
    attempts = preparedResult.attempts;
    const { segments: prepared, usage } = preparedResult;
    if (preparedResult.unresolvedPageNumbers.length > 0) {
      throw new AppError(
        "narration_incomplete",
        `Narration missing page ${preparedResult.unresolvedPageNumbers.join(", ")}`,
        422,
        preparedResult.unresolvedPageNumbers.map((pageNumber) => `narration missing page ${pageNumber}`),
      );
    }

    await db.$transaction(
      [...prepared.values()].flatMap((segment) =>
        (["el", "en"] as const).map((locale) =>
          db.narrationSegment.upsert({
            where: {
              lessonId_pageNumber_locale: {
                lessonId: lesson.id,
                pageNumber: segment.pageNumber,
                locale,
              },
            },
            create: {
              lessonId: lesson.id,
              pageNumber: segment.pageNumber,
              locale,
              script: segment.script[locale],
            },
            update: { script: segment.script[locale] },
          }),
        ),
      ),
    );

    const estimatedCostUsd = estimateCost(usage);
    const model = usage[0]?.model ?? env.OPENAI_TEXT_MODEL;
    await db.generationJob.update({
      where: { lessonId_stage: { lessonId: lesson.id, stage: "NARRATION" } },
      data: {
        status: "COMPLETED",
        attempts,
        model,
        inputTokens: usage.reduce((sum, item) => sum + item.inputTokens, 0),
        outputTokens: usage.reduce((sum, item) => sum + item.outputTokens, 0),
        estimatedCostUsd,
        error: null,
        finishedAt: new Date(),
      },
    });

    return {
      preparedPages: [...prepared.keys()].sort((a, b) => a - b),
      reused: false,
      model,
      usage,
      estimatedCostUsd,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1_000) : "Narration preparation failed";
    await db.generationJob
      .update({
        where: { lessonId_stage: { lessonId: lesson.id, stage: "NARRATION" } },
        data: { status: "FAILED", attempts: Math.max(attempts, 1), error: message, finishedAt: new Date() },
      })
      .catch((dbError) => logger.error({ lessonId: lesson.id, err: dbError }, "could not record narration failure"));
    throw error;
  }
}

export function ensureLessonNarration(
  lessonId: string,
  options: EnsureNarrationOptions = {},
): Promise<NarrationPreparationResult> {
  return (async () => {
    const db = options.db ?? defaultPrisma;
    const lesson = await db.lesson.findUnique({
      where: { id: lessonId },
      include: { pages: { orderBy: { pageNumber: "asc" } } },
    });
    if (!lesson) throw new AppError("not_found", "Lesson not found", 404);
    if (lesson.status === "CANCELLED") throw new AppError("cancelled", "Lesson was cancelled", 409);

    const pages = lesson.pages
      .map((page) => ({ pageNumber: page.pageNumber, text: page.text }))
      .filter((page) => page.text.trim().length > 0);
    if (pages.length === 0) {
      throw new AppError("no_text", "No extracted text is available for this lesson", 422);
    }

    const key = `${lessonId}:${lesson.jobVersion}`;
    const pending = inFlight.get(key);
    if (pending) return pending;

    const promise = run(lesson, pages, options).finally(() => {
      inFlight.delete(key);
    });
    inFlight.set(key, promise);
    return promise;
  })();
}
