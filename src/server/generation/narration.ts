import type { PromptPage, RawNarration } from "./schemas";

export type NarrationNormalizationResult = {
  segments: RawNarration[];
  dropped: {
    count: number;
    pageNumbers: number[];
  };
};

function scriptLength(segment: RawNarration): number {
  return segment.script.el.length + segment.script.en.length;
}

export function normalizeNarration(segments: RawNarration[], pages: PromptPage[]): NarrationNormalizationResult {
  const pageNumbers = new Set(pages.map((page) => page.pageNumber));
  const bestByPage = new Map<number, { segment: RawNarration; length: number }>();
  const droppedPageNumbers = new Set<number>();
  let dropped = 0;

  for (const segment of segments) {
    if (!pageNumbers.has(segment.pageNumber)) {
      dropped += 1;
      droppedPageNumbers.add(segment.pageNumber);
      continue;
    }

    const length = scriptLength(segment);
    const current = bestByPage.get(segment.pageNumber);
    if (!current) {
      bestByPage.set(segment.pageNumber, { segment, length });
      continue;
    }

    dropped += 1;
    droppedPageNumbers.add(segment.pageNumber);
    if (length > current.length) {
      bestByPage.set(segment.pageNumber, { segment, length });
    }
  }

  return {
    segments: [...bestByPage.values()]
      .sort((a, b) => a.segment.pageNumber - b.segment.pageNumber)
      .map((entry) => entry.segment),
    dropped: {
      count: dropped,
      pageNumbers: [...droppedPageNumbers].sort((a, b) => a - b),
    },
  };
}
