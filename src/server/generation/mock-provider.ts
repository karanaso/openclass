import type { GenerationInput, ContentProvider, ProviderResult, StoryGenerationInput } from "./provider";
import type { RawCard, RawNarration, RawQuestion } from "./schemas";
import type { RawStory } from "@/server/story/schemas";

type Sentence = { pageNumber: number; text: string };

function collectSentences(pages: { pageNumber: number; text: string }[]): Sentence[] {
  const sentences = pages.flatMap((page) =>
    page.text
      .split(/(?<=[.!?])\s+|\n+/)
      .map((text) => text.trim())
      .filter((text) => text.length >= 20)
      .map((text) => ({ pageNumber: page.pageNumber, text })),
  );
  if (sentences.length > 0) return sentences;
  return pages.map((page) => ({ pageNumber: page.pageNumber, text: page.text.slice(0, 300) || `Page ${page.pageNumber}` }));
}

function usage(input: GenerationInput, output: unknown) {
  const inputChars = input.pages.reduce((sum, page) => sum + page.text.length, 0);
  return {
    model: "mock-content-v1",
    inputTokens: Math.ceil(inputChars / 4),
    outputTokens: Math.ceil(JSON.stringify(output).length / 4),
  };
}

function unique(prompt: string, index: number, used: Set<string>): string {
  let candidate = prompt;
  let suffix = index + 2;
  while (used.has(candidate)) {
    candidate = `${prompt} (${suffix})`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

export class MockContentProvider implements ContentProvider {
  async cards(input: GenerationInput): Promise<ProviderResult<RawCard[]>> {
    const sentences = collectSentences(input.pages);
    const used = new Set<string>();
    const count = input.counts.cards.min;
    const cards: RawCard[] = Array.from({ length: count }, (_, index) => {
      const sentence = sentences[index % sentences.length];
      const el = unique(`Ποια είναι η βασική ιδέα της σελίδας ${sentence.pageNumber} (${index + 1});`, index, used);
      const en = unique(`What is the key idea of page ${sentence.pageNumber} (${index + 1})?`, index, used);
      return {
        itemKey: `card-${index + 1}`,
        sourcePage: sentence.pageNumber,
        prompt: { el, en },
        answer: { el: sentence.text, en: sentence.text },
      };
    });
    return { items: cards, usage: usage(input, cards) };
  }

  async questions(input: GenerationInput, mode: "questionnaire" | "game"): Promise<ProviderResult<RawQuestion[]>> {
    const sentences = collectSentences(input.pages);
    const used = new Set<string>();
    const count = mode === "questionnaire" ? input.counts.questionnaire.min : input.counts.game.min;
    const questions: RawQuestion[] = Array.from({ length: count }, (_, index) => {
      const correct = sentences[index % sentences.length];
      const type = index % 2 === 0 ? "MULTIPLE_CHOICE" : "TRUE_FALSE";
      const baseEl =
        mode === "game"
          ? `Ποια πρόταση ταιριάζει με τη σελίδα ${correct.pageNumber} (γύρος ${index + 1});`
          : `Ποια πρόταση προέρχεται από τη σελίδα ${correct.pageNumber} (${index + 1});`;
      const baseEn =
        mode === "game"
          ? `Which statement matches page ${correct.pageNumber} (round ${index + 1})?`
          : `Which statement comes from page ${correct.pageNumber} (${index + 1})?`;
      const prompt = {
        el: unique(baseEl, index, used),
        en: unique(baseEn, index, used),
      };

      if (type === "TRUE_FALSE") {
        const isTrue = index % 4 === 1;
        const statement = isTrue ? correct.text : `Δεν αναφέρεται ότι: ${correct.text}`;
        const statementEn = isTrue ? correct.text : `It is not stated that: ${correct.text}`;
        return {
          itemKey: `${mode}-${index + 1}`,
          type,
          correctOptionId: isTrue ? "a" : "b",
          sourcePage: correct.pageNumber,
          prompt: {
            el: `Η πρόταση «${statement}» είναι σωστή; (${index + 1})`,
            en: `Is the statement "${statementEn}" correct? (${index + 1})`,
          },
          options: {
            el: [
              { id: "a", text: "Σωστό" },
              { id: "b", text: "Λάθος" },
            ],
            en: [
              { id: "a", text: "True" },
              { id: "b", text: "False" },
            ],
          },
          explanation: {
            el: `Η σωστή απάντηση προκύπτει από τη σελίδα ${correct.pageNumber}.`,
            en: `The correct answer comes from page ${correct.pageNumber}.`,
          },
        };
      }

      const decoys = [
        ...sentences.filter((item) => item.text !== correct.text).map((item) => item.text),
        "Καμία από τις παραπάνω",
        "Άλλη έννοια του μαθήματος",
        "Δεν αναφέρεται στο κείμενο",
      ];
      const optionTexts = [correct.text, ...decoys].slice(0, 4);
      while (optionTexts.length < 4) optionTexts.push(`Εναλλακτική ${optionTexts.length + 1}`);
      const enOptions = [...optionTexts];
      return {
        itemKey: `${mode}-${index + 1}`,
        type,
        correctOptionId: "a",
        sourcePage: correct.pageNumber,
        prompt,
        options: {
          el: optionTexts.map((text, optionIndex) => ({ id: String.fromCharCode(97 + optionIndex), text })),
          en: enOptions.map((text, optionIndex) => ({ id: String.fromCharCode(97 + optionIndex), text })),
        },
        explanation: {
          el: `Η σωστή απάντηση προκύπτει από τη σελίδα ${correct.pageNumber}.`,
          en: `The correct answer comes from page ${correct.pageNumber}.`,
        },
      };
    });
    return { items: questions, usage: usage(input, questions) };
  }

  async narration(input: GenerationInput): Promise<ProviderResult<RawNarration[]>> {
    const segments: RawNarration[] = input.pages.map((page) => {
      const text = page.text.split(/(?<=[.!?])\s+/).slice(0, 4).join(" ").slice(0, 900) || page.text.slice(0, 900);
      return {
        pageNumber: page.pageNumber,
        script: { el: text, en: text },
      };
    });
    return { items: segments, usage: usage(input, segments) };
  }

  async story(input: StoryGenerationInput): Promise<ProviderResult<RawStory>> {
    if (input.mode === "repair" && input.existing) {
      return { items: input.existing, usage: storyUsage(input, input.existing) };
    }
    if (input.mode === "merge" && input.beats?.length) {
      const story: RawStory = {
        title: input.title?.trim() || "A lesson story",
        logline: "A clear journey through the lesson's key ideas.",
        scenes: input.beats.map((beat, index) => ({
          sceneKey: beat.sceneKey || `scene-${index + 1}`,
          sourcePages: beat.sourcePages,
          narration: beat.narration,
          visualDirection: beat.visualDirection,
        })),
      };
      return { items: story, usage: storyUsage(input, story) };
    }

    const pages = input.pages.length > 0 ? input.pages : [{ pageNumber: 1, text: "Lesson content" }];
    const sceneCount = Math.max(3, Math.min(6, pages.length + 1));
    const scenes = Array.from({ length: sceneCount }, (_, index) => {
      const page = pages[index % pages.length];
      const text = page.text.split(/(?<=[.!?])\s+/).slice(0, 3).join(" ").slice(0, 700) || page.text.slice(0, 700);
      return {
        sceneKey: `scene-${index + 1}`,
        sourcePages: [page.pageNumber],
        narration: {
          el: index === 0 ? `Ας ξεκινήσουμε. ${text}` : text,
          en: index === 0 ? `Let's begin. ${text}` : text,
        },
        visualDirection: "Friendly illustrated lesson scene.",
      };
    });
    const story: RawStory = {
      title: input.title?.trim() || "A lesson story",
      logline: "A friendly journey through the lesson's most important ideas.",
      scenes,
    };
    return { items: story, usage: storyUsage(input, story) };
  }
}

function storyUsage(input: StoryGenerationInput, output: RawStory) {
  const inputChars = input.pages.reduce((sum, page) => sum + page.text.length, 0);
  return {
    model: "mock-story-v1",
    inputTokens: Math.ceil(inputChars / 4),
    outputTokens: Math.ceil(JSON.stringify(output).length / 4),
  };
}
