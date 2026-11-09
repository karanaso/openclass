import { describe, expect, it } from "vitest";
import { prepareNarrationForPages } from "@/server/generation/lesson-narration";
import type { ContentProvider, ProviderResult } from "@/server/generation/provider";
import type { ContentCounts, PromptPage, RawNarration } from "@/server/generation/schemas";

const pages: PromptPage[] = [
  { pageNumber: 1, text: "Photosynthesis converts light into chemical energy." },
  { pageNumber: 2, text: "Cellular respiration releases energy from glucose." },
];

const counts: ContentCounts = {
  cards: { min: 1, max: 2 },
  questionnaire: { min: 1, max: 2 },
  game: { min: 1, max: 2 },
};

const usage = { model: "gpt-test", inputTokens: 10, outputTokens: 20 };

function segment(pageNumber: number, text: string): RawNarration {
  return { pageNumber, script: { el: text, en: text } };
}

function provider(
  narration: (input: Parameters<ContentProvider["narration"]>[0]) => Promise<ProviderResult<RawNarration[]>>,
): ContentProvider {
  return {
    cards: async () => {
      throw new Error("cards should not run");
    },
    questions: async () => {
      throw new Error("questions should not run");
    },
    narration,
  };
}

describe("narration preparation", () => {
  it("uses one pass when every page is returned", async () => {
    const calls: number[][] = [];
    const result = await prepareNarrationForPages(
      provider(async (input) => {
        calls.push(input.pages.map((page) => page.pageNumber));
        return { items: input.pages.map((page) => segment(page.pageNumber, `Page ${page.pageNumber}`)), usage };
      }),
      pages,
      counts,
      "en",
    );

    expect(calls).toEqual([[1, 2]]);
    expect(result.attempts).toBe(1);
    expect(result.unresolvedPageNumbers).toEqual([]);
    expect([...result.segments.keys()]).toEqual([1, 2]);
  });

  it("keeps the longest duplicate and drops out-of-scope pages", async () => {
    const result = await prepareNarrationForPages(
      provider(async () => ({
        items: [segment(1, "Short"), segment(1, "Much longer page one"), segment(99, "Outside"), segment(2, "Page two")],
        usage,
      })),
      pages,
      counts,
      "en",
    );

    expect(result.attempts).toBe(1);
    expect(result.unresolvedPageNumbers).toEqual([]);
    expect(result.segments.get(1)?.script.en).toBe("Much longer page one");
    expect([...result.segments.keys()].sort()).toEqual([1, 2]);
  });

  it("requests only the missing pages on the repair pass", async () => {
    const calls: number[][] = [];
    const result = await prepareNarrationForPages(
      provider(async (input) => {
        calls.push(input.pages.map((page) => page.pageNumber));
        return {
          items: input.pages
            .filter((page) => page.pageNumber === 1)
            .map((page) => segment(page.pageNumber, "Page one")),
          usage,
        };
      }),
      pages,
      counts,
      "el",
    );

    expect(calls).toEqual([[1, 2], [2]]);
    expect(result.attempts).toBe(2);
    expect(result.unresolvedPageNumbers).toEqual([2]);
  });

  it("stops after one repair pass and reports the unresolved pages", async () => {
    const calls: number[][] = [];
    const result = await prepareNarrationForPages(
      provider(async (input) => {
        calls.push(input.pages.map((page) => page.pageNumber));
        return { items: [segment(1, "Only page one")], usage };
      }),
      pages,
      counts,
      "en",
    );

    expect(calls).toEqual([[1, 2], [2]]);
    expect(result.attempts).toBe(2);
    expect(result.unresolvedPageNumbers).toEqual([2]);
  });
});
