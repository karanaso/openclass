import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { ContentProvider, ResourceSuggestionInput } from "@/server/generation/provider";
import { AppError } from "@/lib/errors";
import { MAX_AI_SUGGESTIONS_PER_REQUEST } from "@/lib/resources";

vi.mock("@/server/services/resources", () => ({
  createSuggestedResources: vi.fn(),
}));

import { createSuggestedResources } from "@/server/services/resources";
import { suggestLessonResources } from "@/server/services/resource-suggestions";

function lesson(overrides: Record<string, unknown> = {}) {
  return {
    id: "lesson-1",
    title: "Biology",
    sourceLocale: "en",
    topics: null,
    pages: [
      { pageNumber: 1, text: "Photosynthesis converts light into chemical energy." },
      { pageNumber: 2, text: "Plants use chlorophyll." },
    ],
    ...overrides,
  };
}

function dbFor(value: ReturnType<typeof lesson>, resourceCount = 0) {
  return {
    lesson: { findUnique: vi.fn(async () => value) },
    lessonResource: { count: vi.fn(async () => resourceCount) },
  } as unknown as PrismaClient;
}

function providerReturning(items: unknown[], onCall?: (input: ResourceSuggestionInput) => void): ContentProvider {
  return {
    cards: vi.fn(),
    questions: vi.fn(),
    topics: vi.fn(),
    suggestResources: vi.fn(async (input: ResourceSuggestionInput) => {
      onCall?.(input);
      return {
        items,
        usage: { model: "test-model", inputTokens: 10, outputTokens: 5 },
      };
    }),
  } as unknown as ContentProvider;
}

const usageResult = { created: 1, resources: [] };

beforeEach(() => {
  vi.mocked(createSuggestedResources).mockReset();
  vi.mocked(createSuggestedResources).mockResolvedValue(usageResult);
});

describe("suggestLessonResources", () => {
  it("keeps valid proposals and discards invalid ones independently", async () => {
    const validUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    const provider = providerReturning([
      { title: "  Video  ", description: "d".repeat(600), url: validUrl },
      { title: null, url: "https://example.com/no-title" },
      { title: "Bad URL", url: "javascript:alert(1)" },
      { title: "Game", description: "Play", url: "https://example.com/game" },
    ]);

    await suggestLessonResources("lesson-1", { db: dbFor(lesson()), provider });

    expect(createSuggestedResources).toHaveBeenCalledTimes(1);
    const candidates = vi.mocked(createSuggestedResources).mock.calls[0][1];
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      title: "Video",
      url: validUrl,
      source: "AI",
      sourcePage: null,
    });
    expect(candidates[0].description).toHaveLength(500);
    expect(candidates[1]).toMatchObject({ title: "Game", url: "https://example.com/game" });
  });

  it("passes topics and lesson text to the provider and caps proposals", async () => {
    let received: ResourceSuggestionInput | undefined;
    const proposals = Array.from({ length: 12 }, (_, index) => ({
      title: `Suggestion ${index}`,
      url: `https://example.com/resource-${index}`,
    }));
    const provider = providerReturning(proposals, (input) => {
      received = input;
    });

    await suggestLessonResources("lesson-1", {
      db: dbFor(lesson({ topics: { el: ["Φωτοσύνθεση"], en: ["Photosynthesis"] } })),
      provider,
    });

    expect(received?.topics).toEqual({ el: ["Φωτοσύνθεση"], en: ["Photosynthesis"] });
    expect(received?.title).toBe("Biology");
    expect(received?.limit).toBe(MAX_AI_SUGGESTIONS_PER_REQUEST);
    const candidates = vi.mocked(createSuggestedResources).mock.calls[0][1];
    expect(candidates).toHaveLength(MAX_AI_SUGGESTIONS_PER_REQUEST);
  });

  it("rejects a lesson with no usable content without calling the provider", async () => {
    const suggest = vi.fn();
    const provider = { suggestResources: suggest } as unknown as ContentProvider;

    await expect(
      suggestLessonResources("lesson-1", {
        db: dbFor(lesson({ title: "   ", topics: null, pages: [] })),
        provider,
      }),
    ).rejects.toMatchObject({ code: "insufficient_content" });

    expect(suggest).not.toHaveBeenCalled();
    expect(createSuggestedResources).not.toHaveBeenCalled();
  });

  it("reports the per-lesson resource limit before calling the provider", async () => {
    const suggest = vi.fn();
    const provider = { suggestResources: suggest } as unknown as ContentProvider;

    await expect(
      suggestLessonResources("lesson-1", { db: dbFor(lesson(), 50), provider }),
    ).rejects.toMatchObject({ code: "resource_limit_reached" });

    expect(suggest).not.toHaveBeenCalled();
  });

  it("propagates provider failures without creating resources", async () => {
    const provider = {
      suggestResources: vi.fn(async () => {
        throw new AppError("provider_failed", "upstream down", 502);
      }),
    } as unknown as ContentProvider;

    await expect(
      suggestLessonResources("lesson-1", { db: dbFor(lesson()), provider }),
    ).rejects.toMatchObject({ code: "provider_failed" });
    expect(createSuggestedResources).not.toHaveBeenCalled();
  });

  it("does not fetch any proposed URL", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const provider = providerReturning([
      { title: "Video", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    ]);

    await suggestLessonResources("lesson-1", { db: dbFor(lesson()), provider });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
