import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/server/db";
import { AppError, NotFoundError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { parseLessonTopics, type LessonTopics } from "@/lib/topics";
import {
  MAX_AI_SUGGESTIONS_PER_REQUEST,
  MAX_RESOURCES_PER_LESSON,
  RESOURCE_DESCRIPTION_MAX,
  RESOURCE_TITLE_MAX,
  parseResourceUrl,
} from "@/lib/resources";
import { getContentProvider } from "@/server/generation/provider-factory";
import type { ContentProvider, ResourceSuggestionInput } from "@/server/generation/provider";
import { createSuggestedResources, type CreateSuggestedResourcesResult, type ResourceCandidate } from "./resources";

export type SuggestResourcesOptions = {
  provider?: ContentProvider;
  db?: PrismaClient;
};

function cleanTitle(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const title = value.trim();
  if (!title || title.length > RESOURCE_TITLE_MAX) return null;
  return title;
}

function cleanDescription(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const description = value.trim();
  return description ? description.slice(0, RESOURCE_DESCRIPTION_MAX) : null;
}

export async function suggestLessonResources(
  lessonId: string,
  options: SuggestResourcesOptions = {},
): Promise<CreateSuggestedResourcesResult> {
  const db = options.db ?? defaultPrisma;
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    include: { pages: { orderBy: { pageNumber: "asc" } } },
  });
  if (!lesson) throw new NotFoundError("Lesson not found");

  const existingCount = await db.lessonResource.count({ where: { lessonId } });
  if (existingCount >= MAX_RESOURCES_PER_LESSON) {
    throw new AppError(
      "resource_limit_reached",
      "This lesson has reached its resource limit",
      409,
    );
  }

  const pages = lesson.pages
    .map((page) => ({ pageNumber: page.pageNumber, text: page.text }))
    .filter((page) => page.text.trim().length > 0);
  const topics: LessonTopics = parseLessonTopics(lesson.topics);
  const title = lesson.title.trim();
  if (!title && pages.length === 0 && topics.el.length === 0 && topics.en.length === 0) {
    throw new AppError(
      "insufficient_content",
      "There is not enough lesson content to suggest resources",
      422,
    );
  }

  const provider = options.provider ?? getContentProvider();
  const input: ResourceSuggestionInput = {
    title: title || "Lesson",
    topics,
    pages,
    sourceLocale: lesson.sourceLocale as "el" | "en",
    limit: MAX_AI_SUGGESTIONS_PER_REQUEST,
  };
  const generated = await provider.suggestResources(input);
  logger.info(
    {
      lessonId,
      model: generated.usage.model,
      inputTokens: generated.usage.inputTokens,
      outputTokens: generated.usage.outputTokens,
      proposals: generated.items.length,
    },
    "resource suggestions generated",
  );

  const candidates: ResourceCandidate[] = [];
  for (const proposal of generated.items) {
    if (candidates.length >= MAX_AI_SUGGESTIONS_PER_REQUEST) break;

    const proposalTitle = cleanTitle(proposal.title);
    if (!proposalTitle) continue;
    if (typeof proposal.url !== "string") continue;
    const normalized = parseResourceUrl(proposal.url);
    if (!normalized.ok) continue;

    candidates.push({
      title: proposalTitle,
      description: cleanDescription(proposal.description),
      url: normalized.value.url,
      source: "AI",
      sourcePage: null,
    });
  }

  if (candidates.length === 0) return { created: 0, resources: [] };
  return createSuggestedResources(lessonId, candidates, db);
}
