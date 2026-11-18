import { TOPIC_MAX } from "@/lib/topics";
import type {
  ContentProvider,
  GenerationInput,
  LessonContextInput,
  ProviderResult,
  ResourceSuggestionInput,
  RubricInput,
} from "./provider";
import type { PromptPage, RawCard, RawQuestion, RawResourceSuggestion, RawRubric, RawTopics } from "./schemas";

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

function usage(pages: PromptPage[], output: unknown) {
  const inputChars = pages.reduce((sum, page) => sum + page.text.length, 0);
  return {
    model: "mock-content-v1",
    inputTokens: Math.ceil(inputChars / 4),
    outputTokens: Math.ceil(JSON.stringify(output).length / 4),
  };
}

function topicFromSentence(text: string): string {
  return text
    .replace(/[.!?;:]+.*$/su, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TOPIC_MAX);
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
    return { items: cards, usage: usage(input.pages, cards) };
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
    return { items: questions, usage: usage(input.pages, questions) };
  }

  async topics(input: LessonContextInput): Promise<ProviderResult<RawTopics>> {
    const sentences = collectSentences(input.pages);
    const seen = new Set<string>();
    const topics: string[] = [];

    for (const sentence of sentences) {
      const topic = topicFromSentence(sentence.text);
      if (!topic || seen.has(topic.toLocaleLowerCase("el"))) continue;
      seen.add(topic.toLocaleLowerCase("el"));
      topics.push(topic);
      if (topics.length >= 4) break;
    }

    const items: RawTopics = { el: [...topics], en: [...topics] };
    return { items, usage: usage(input.pages, items) };
  }

  async suggestResources(input: ResourceSuggestionInput): Promise<ProviderResult<RawResourceSuggestion[]>> {
    const topic = input.topics.en[0] ?? input.topics.el[0] ?? input.title;
    const items: RawResourceSuggestion[] = [
      {
        title: `${topic}: video overview`.slice(0, 200),
        description: `A mock video suggestion for ${topic}. Verify it before approving.`,
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      },
      {
        title: `${topic}: interactive game`.slice(0, 200),
        description: `A mock game suggestion for ${topic}. Verify it before approving.`,
        url: "https://example.com/educational-game",
      },
    ].slice(0, Math.max(0, input.limit));

    return { items, usage: usage(input.pages, items) };
  }

  async rubric(input: RubricInput): Promise<ProviderResult<RawRubric>> {
    const items: RawRubric = {
      criteria: [
        {
          id: "criterion-understanding",
          title: { el: "Κατανόηση βασικών εννοιών", en: "Understanding key concepts" },
          description: {
            el: "Ο μαθητής εξηγεί σωστά τις βασικές έννοιες του μαθήματος.",
            en: "The student correctly explains the lesson's key concepts.",
          },
        },
        {
          id: "criterion-application",
          title: { el: "Εφαρμογή γνώσης", en: "Applying knowledge" },
          description: {
            el: "Ο μαθητής χρησιμοποιεί τις γνώσεις του για να απαντήσει σε νέες ερωτήσεις.",
            en: "The student uses the lesson knowledge to answer new questions.",
          },
        },
        {
          id: "criterion-accuracy",
          title: { el: "Ακρίβεια και τεκμηρίωση", en: "Accuracy and justification" },
          description: {
            el: "Ο μαθητής απαντά με ακρίβεια και στηρίζει τις απαντήσεις του στο κείμενο.",
            en: "The student answers accurately and supports answers with the lesson text.",
          },
        },
      ],
      levels: [
        {
          id: "level-excellent",
          label: { el: "Εξαιρετικό", en: "Excellent" },
          description: {
            el: "Η κατανόηση και η εφαρμογή είναι σταθερές και ακριβείς.",
            en: "Understanding and application are consistent and accurate.",
          },
        },
        {
          id: "level-good",
          label: { el: "Καλό", en: "Good" },
          description: {
            el: "Οι βασικές ιδέες είναι κατανοητές με μικρά κενά.",
            en: "The main ideas are understood with minor gaps.",
          },
        },
        {
          id: "level-developing",
          label: { el: "Υπό ανάπτυξη", en: "Developing" },
          description: {
            el: "Ορισμένες βασικές ιδέες χρειάζονται περισσότερη εξάσκηση.",
            en: "Some key ideas need further practice.",
          },
        },
        {
          id: "level-support",
          label: { el: "Χρειάζεται υποστήριξη", en: "Needs support" },
          description: {
            el: "Απαιτείται επανάληψη των βασικών εννοιών με καθοδήγηση.",
            en: "The key concepts need guided review.",
          },
        },
      ],
    };
    return { items, usage: usage(input.pages, items) };
  }
}
