import type { ContentCounts, PromptPage } from "./schemas";
import type { GenerationInput, GenerationKind } from "./provider";

export const PROMPT_VERSION = "v1";
export const DEFAULT_MAX_CHARS = 48_000;

export function chunkPages(pages: PromptPage[], maxChars = DEFAULT_MAX_CHARS): PromptPage[][] {
  const chunks: PromptPage[][] = [];
  let current: PromptPage[] = [];
  let size = 0;

  for (const page of pages) {
    const text = page.text.length > maxChars ? page.text.slice(0, maxChars) : page.text;
    const cost = text.length + 32;
    if (current.length > 0 && size + cost > maxChars) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push({ pageNumber: page.pageNumber, text });
    size += cost;
  }
  if (current.length > 0) chunks.push(current);
  return chunks.length > 0 ? chunks : [[]];
}

export function renderPageText(pages: PromptPage[]): string {
  return pages.map((page) => `[Page ${page.pageNumber}]\n${page.text}`).join("\n\n");
}

function instructions(kind: GenerationKind, counts: ContentCounts): string {
  const locale = "Every item MUST contain both a Greek (el) and English (en) variant with identical meaning, answer keys, option ids, and source page.";
  switch (kind) {
    case "cards":
      return `Create ${counts.cards.min}-${counts.cards.max} study cards. Each card has itemKey, sourcePage, prompt {el,en}, and answer {el,en}. ${locale} Cards should cover distinct ideas, not repeat the same fact.`;
    case "questionnaire":
      return `Create ${counts.questionnaire.min}-${counts.questionnaire.max} assessment questions mixing TRUE_FALSE and MULTIPLE_CHOICE. Each has itemKey, type, correctOptionId, sourcePage, prompt {el,en}, options {el:[{id,text}],en:[{id,text}]}, and explanation {el,en}. TRUE_FALSE has exactly two options with ids "a" and "b". MULTIPLE_CHOICE has exactly four options with ids "a","b","c","d". Exactly one option is correct and the same option id is correct in both locales. ${locale}`;
    case "game":
      return `Create ${counts.game.min}-${counts.game.max} game questions ordered from easiest to hardest. Each has itemKey, type, correctOptionId, sourcePage, prompt {el,en}, options {el,en}, and explanation {el,en}. Prefer four-option MULTIPLE_CHOICE questions; TRUE_FALSE is allowed. Exactly one option is correct and the same option id is correct in both locales. ${locale}`;
    case "narration":
      return "Create one narration segment per PDF page, in page order. Each segment has pageNumber and script {el,en}. The script should be 2-4 spoken sentences that explain the page's content, not just read it verbatim. " + locale;
  }
}

export function buildPrompt(input: GenerationInput): { system: string; user: string; promptVersion: string } {
  const system =
    "You are an expert teacher and assessment designer. You turn lesson PDF text into accurate, source-grounded learning content. Use only facts supported by the supplied page text. Never invent facts, names, numbers, or definitions. If the text is insufficient for an item, omit that item. Return only valid JSON matching the requested schema.";
  const user = [
    `Lesson primary language: ${input.sourceLocale === "el" ? "Greek" : "English"}.`,
    instructions(input.kind, input.counts),
    "All sourcePage/sourcePage values must be page numbers that exist in the supplied text. Do not include page numbers outside the supplied pages.",
    "Source text:",
    renderPageText(input.pages),
  ].join("\n\n");
  return { system, user, promptVersion: PROMPT_VERSION };
}
