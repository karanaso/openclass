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

export interface ContentProvider {
  cards(input: GenerationInput): Promise<ProviderResult<RawCard[]>>;
  questions(input: GenerationInput, mode: "questionnaire" | "game"): Promise<ProviderResult<RawQuestion[]>>;
  narration(input: GenerationInput): Promise<ProviderResult<RawNarration[]>>;
}
