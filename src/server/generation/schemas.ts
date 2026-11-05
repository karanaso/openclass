import { z } from "zod";

export const localeTextSchema = z.object({
  el: z.string().trim().min(1).max(6000),
  en: z.string().trim().min(1).max(6000),
});

export const optionSchema = z.object({
  id: z.string().trim().min(1).max(8),
  text: z.string().trim().min(1).max(3000),
});

export const rawCardSchema = z.object({
  itemKey: z.string().trim().min(1).max(100),
  sourcePage: z.number().int().positive(),
  prompt: localeTextSchema,
  answer: localeTextSchema,
});

export const rawQuestionSchema = z.object({
  itemKey: z.string().trim().min(1).max(100),
  type: z.enum(["TRUE_FALSE", "MULTIPLE_CHOICE"]),
  correctOptionId: z.string().trim().min(1).max(8),
  sourcePage: z.number().int().positive(),
  prompt: localeTextSchema,
  options: z.object({
    el: z.array(optionSchema).min(2).max(4),
    en: z.array(optionSchema).min(2).max(4),
  }),
  explanation: localeTextSchema,
});

export const rawNarrationSchema = z.object({
  pageNumber: z.number().int().positive(),
  script: localeTextSchema,
});

export const cardsArtifactSchema = z.object({ cards: z.array(rawCardSchema).min(1) });
export const questionsArtifactSchema = z.object({ questions: z.array(rawQuestionSchema).min(1) });
export const narrationArtifactSchema = z.object({ segments: z.array(rawNarrationSchema).min(1) });

export type RawCard = z.infer<typeof rawCardSchema>;
export type RawQuestion = z.infer<typeof rawQuestionSchema>;
export type RawNarration = z.infer<typeof rawNarrationSchema>;

export type ContentCounts = {
  cards: { min: number; max: number };
  questionnaire: { min: number; max: number };
  game: { min: number; max: number };
};

export type PromptPage = { pageNumber: number; text: string };
