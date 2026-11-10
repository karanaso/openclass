import type { RawStory, StoryBeat, StoryPage } from "@/server/story/schemas";
import type { ContentCounts, PromptPage, RawCard, RawNarration, RawQuestion } from "./schemas";

export type GenerationKind = "cards" | "questionnaire" | "game" | "narration";

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

export type StoryGenerationInput = {
  mode: "draft" | "merge" | "repair";
  pages: StoryPage[];
  sourceLocale: "el" | "en";
  title?: string;
  beats?: StoryBeat[];
  existing?: RawStory;
  repairNotes?: string[];
  missingPageNumbers?: number[];
};

export interface ContentProvider {
  cards(input: GenerationInput): Promise<ProviderResult<RawCard[]>>;
  questions(input: GenerationInput, mode: "questionnaire" | "game"): Promise<ProviderResult<RawQuestion[]>>;
  narration(input: GenerationInput): Promise<ProviderResult<RawNarration[]>>;
  story(input: StoryGenerationInput): Promise<ProviderResult<RawStory>>;
}
