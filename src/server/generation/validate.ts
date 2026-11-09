import { AppError } from "@/lib/errors";
import type { ContentCounts, PromptPage, RawCard, RawQuestion } from "./schemas";
import type { GeneratedArtifacts, GeneratedQuestion } from "./types";

const normalize = (value: string) =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[«»"'“”]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export type RawArtifacts = {
  cards: RawCard[];
  questionnaire: RawQuestion[];
  game: RawQuestion[];
};

export function validateGeneratedArtifacts(
  raw: RawArtifacts,
  pages: PromptPage[],
  counts: ContentCounts,
): GeneratedArtifacts {
  const errors: string[] = [];
  const pageNumbers = new Set(pages.map((page) => page.pageNumber));

  const checkCount = (label: string, length: number, min: number, max: number) => {
    if (length < min || length > max) {
      errors.push(`${label} must contain ${min}-${max} items (received ${length})`);
    }
  };

  checkCount("cards", raw.cards.length, counts.cards.min, counts.cards.max);
  checkCount("questionnaire", raw.questionnaire.length, counts.questionnaire.min, counts.questionnaire.max);
  checkCount("game", raw.game.length, counts.game.min, counts.game.max);

  const cardKeys = new Set<string>();
  const cardPrompts = new Set<string>();
  for (const card of raw.cards) {
    if (!pageNumbers.has(card.sourcePage)) errors.push(`card ${card.itemKey} cites missing page ${card.sourcePage}`);
    if (cardKeys.has(card.itemKey)) errors.push(`duplicate card key ${card.itemKey}`);
    cardKeys.add(card.itemKey);
    const prompt = normalize(card.prompt.el);
    if (cardPrompts.has(prompt)) errors.push(`duplicate card prompt: ${card.prompt.el.slice(0, 60)}`);
    cardPrompts.add(prompt);
  }

  const normalizeQuestions = (questions: RawQuestion[], label: string): GeneratedQuestion[] => {
    const keys = new Set<string>();
    const prompts = new Set<string>();
    return questions.map((question, index) => {
      if (!pageNumbers.has(question.sourcePage)) {
        errors.push(`${label} ${question.itemKey} cites missing page ${question.sourcePage}`);
      }
      if (keys.has(question.itemKey)) errors.push(`duplicate ${label} key ${question.itemKey}`);
      keys.add(question.itemKey);

      const prompt = normalize(question.prompt.el);
      if (prompts.has(prompt)) errors.push(`duplicate ${label} prompt: ${question.prompt.el.slice(0, 60)}`);
      prompts.add(prompt);

      const elIds = question.options.el.map((option) => option.id);
      const enIds = question.options.en.map((option) => option.id);
      if (elIds.length !== enIds.length || elIds.some((id, optionIndex) => id !== enIds[optionIndex])) {
        errors.push(`${label} ${question.itemKey} option ids do not align across locales`);
      }
      if (new Set(elIds).size !== elIds.length) {
        errors.push(`${label} ${question.itemKey} has duplicate option ids`);
      }
      if (!elIds.includes(question.correctOptionId)) {
        errors.push(`${label} ${question.itemKey} correct option id is missing`);
      }
      if (question.type === "TRUE_FALSE" && elIds.length !== 2) {
        errors.push(`${label} ${question.itemKey} true/false must have exactly two options`);
      }
      if (question.type === "MULTIPLE_CHOICE" && elIds.length !== 4) {
        errors.push(`${label} ${question.itemKey} multiple choice must have exactly four options`);
      }

      return {
        itemKey: question.itemKey,
        position: index,
        type: question.type,
        correctOptionId: question.correctOptionId,
        sourcePage: question.sourcePage,
        prompt: question.prompt,
        options: question.options,
        explanation: question.explanation,
      };
    });
  };

  const questionnaire = normalizeQuestions(raw.questionnaire, "questionnaire");
  const game = normalizeQuestions(raw.game, "game");

  if (errors.length > 0) {
    throw new AppError("invalid_generation", `Generated content failed validation: ${errors.slice(0, 3).join("; ")}`, 422, errors);
  }

  return {
    cards: raw.cards.map((card, index) => ({
      itemKey: card.itemKey,
      position: index,
      sourcePage: card.sourcePage,
      prompt: card.prompt,
      answer: card.answer,
    })),
    questionnaire,
    game,
  };
}
