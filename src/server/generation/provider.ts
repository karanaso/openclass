import type { LessonTopics } from "@/lib/topics";
import type {
  ContentCounts,
  PromptPage,
  RawCard,
  RawQuestion,
  RawResourceSuggestion,
  RawRubric,
  RawTopics,
} from "./schemas";

export type GenerationKind = "cards" | "questionnaire" | "game";

export type ProviderUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
};

export type ProviderResult<T> = {
  items: T;
  usage: ProviderUsage;
};

export type GenerationInput = {
  kind: GenerationKind;
  pages: PromptPage[];
  counts: ContentCounts;
  sourceLocale: "el" | "en";
};

export type LessonContextInput = {
  pages: PromptPage[];
  sourceLocale: "el" | "en";
};

export type ResourceSuggestionInput = LessonContextInput & {
  title: string;
  topics: LessonTopics;
  limit: number;
};

export type RubricInput = LessonContextInput & {
  title: string;
  topics: LessonTopics;
  questions: string[];
};

export interface ContentProvider {
  cards(input: GenerationInput): Promise<ProviderResult<RawCard[]>>;
  questions(input: GenerationInput, mode: "questionnaire" | "game"): Promise<ProviderResult<RawQuestion[]>>;
  topics(input: LessonContextInput): Promise<ProviderResult<RawTopics>>;
  suggestResources(input: ResourceSuggestionInput): Promise<ProviderResult<RawResourceSuggestion[]>>;
  rubric(input: RubricInput): Promise<ProviderResult<RawRubric>>;
}
