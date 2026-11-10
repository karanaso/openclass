import { chunkPages } from "@/server/generation/prompts";
import type { StoryPage } from "./schemas";

export function chunkStoryPages(pages: StoryPage[], maxChars: number): StoryPage[][] {
  const budget = Math.max(1, maxChars - 32);
  const expanded = pages.flatMap((page) => {
    if (page.text.length <= budget) return [page];
    const parts: StoryPage[] = [];
    for (let offset = 0; offset < page.text.length; offset += budget) {
      parts.push({ pageNumber: page.pageNumber, text: page.text.slice(offset, offset + budget) });
    }
    return parts;
  });
  return chunkPages(expanded, maxChars);
}
