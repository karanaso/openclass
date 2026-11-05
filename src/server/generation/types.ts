export type LocaleText = { el: string; en: string };

export type GeneratedCard = {
  itemKey: string;
  position: number;
  sourcePage: number;
  prompt: LocaleText;
  answer: LocaleText;
};

export type GeneratedOption = { id: string; text: string };

export type GeneratedQuestion = {
  itemKey: string;
  position: number;
  type: "TRUE_FALSE" | "MULTIPLE_CHOICE";
  correctOptionId: string;
  sourcePage: number;
  prompt: LocaleText;
  options: { el: GeneratedOption[]; en: GeneratedOption[] };
  explanation: LocaleText;
};

export type GeneratedNarration = {
  pageNumber: number;
  script: LocaleText;
};

export type GeneratedArtifacts = {
  cards: GeneratedCard[];
  questionnaire: GeneratedQuestion[];
  game: GeneratedQuestion[];
  narration: GeneratedNarration[];
};
