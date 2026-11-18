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

const rawQuestionBaseSchema = z.object({
  itemKey: z.string().trim().min(1).max(100),
  correctOptionId: z.string().trim().min(1).max(8),
  sourcePage: z.number().int().positive(),
  prompt: localeTextSchema,
  explanation: localeTextSchema,
});

export const rawTrueFalseQuestionSchema = rawQuestionBaseSchema.extend({
  type: z.literal("TRUE_FALSE"),
  options: z.object({
    el: z.array(optionSchema).length(2),
    en: z.array(optionSchema).length(2),
  }),
});

export const rawMultipleChoiceQuestionSchema = rawQuestionBaseSchema.extend({
  type: z.literal("MULTIPLE_CHOICE"),
  options: z.object({
    el: z.array(optionSchema).length(4),
    en: z.array(optionSchema).length(4),
  }),
});

export const rawQuestionSchema = z.discriminatedUnion("type", [
  rawTrueFalseQuestionSchema,
  rawMultipleChoiceQuestionSchema,
]);

export const cardsArtifactSchema = z.object({ cards: z.array(rawCardSchema).min(1) });
export const questionsArtifactSchema = z.object({ questions: z.array(rawQuestionSchema).min(1) });

export const topicsArtifactSchema = z.object({
  topics: z.object({
    el: z.array(z.string()),
    en: z.array(z.string()),
  }),
});

export const rawResourceSuggestionSchema = z.object({
  title: z.string().max(500).optional().nullable(),
  description: z.string().max(4000).optional().nullable(),
  url: z.string().max(4000).optional().nullable(),
});

export const resourceSuggestionsArtifactSchema = z.object({
  resources: z.array(rawResourceSuggestionSchema).max(12),
});

const rubricTextResponseSchema = z.object({
  el: z.string(),
  en: z.string(),
});

export const rawRubricCriterionSchema = z.object({
  id: z.string().optional().nullable(),
  title: rubricTextResponseSchema.optional().nullable(),
  description: rubricTextResponseSchema.optional().nullable(),
});

export const rawRubricLevelSchema = z.object({
  id: z.string().optional().nullable(),
  label: rubricTextResponseSchema.optional().nullable(),
  description: rubricTextResponseSchema.optional().nullable(),
});

export const rubricArtifactSchema = z.object({
  criteria: z.array(rawRubricCriterionSchema).max(20),
  levels: z.array(rawRubricLevelSchema).max(10),
});

export type RawCard = z.infer<typeof rawCardSchema>;
export type RawQuestion = z.infer<typeof rawQuestionSchema>;
export type RawTopics = z.infer<typeof topicsArtifactSchema>["topics"];
export type RawResourceSuggestion = z.infer<typeof rawResourceSuggestionSchema>;
export type RawRubric = z.infer<typeof rubricArtifactSchema>;

export type ContentCounts = {
  cards: { min: number; max: number };
  questionnaire: { min: number; max: number };
  game: { min: number; max: number };
};

export type PromptPage = { pageNumber: number; text: string };
