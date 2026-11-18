import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import zodToJsonSchema from "zod-to-json-schema";
import { detectContentLocale } from "@/lib/locale";
import { parseResourceUrl } from "@/lib/resources";
import { extractPdfPages } from "@/server/pdf/extract";
import type { ContentProvider } from "@/server/generation/provider";
import { MockContentProvider } from "@/server/generation/mock-provider";
import {
  PROMPT_VERSION,
  buildPrompt,
  buildResourceSuggestionPrompt,
  buildRubricPrompt,
  buildTopicsPrompt,
  chunkPages,
  renderPageText,
  selectTopicPages,
} from "@/server/generation/prompts";
import {
  cardsArtifactSchema,
  questionsArtifactSchema,
  resourceSuggestionsArtifactSchema,
  rubricArtifactSchema,
  topicsArtifactSchema,
  type ContentCounts,
  type PromptPage,
} from "@/server/generation/schemas";
import { validateGeneratedArtifacts } from "@/server/generation/validate";

const pages: PromptPage[] = [
  {
    pageNumber: 1,
    text: "Photosynthesis converts light energy into chemical energy. Plants use chlorophyll to absorb light. Mitochondria produce ATP for the cell.",
  },
  {
    pageNumber: 2,
    text: "Cellular respiration releases energy from glucose. It happens in the mitochondria of eukaryotic cells. Oxygen is used in aerobic respiration.",
  },
];

const counts: ContentCounts = {
  cards: { min: 2, max: 4 },
  questionnaire: { min: 3, max: 5 },
  game: { min: 2, max: 4 },
};

async function makeRaw() {
  const provider = new MockContentProvider();
  const input = { kind: "cards" as const, pages, counts, sourceLocale: "en" as const };
  const cards = await provider.cards(input);
  const questionnaire = await provider.questions(input, "questionnaire");
  const game = await provider.questions(input, "game");
  return {
    cards: cards.items,
    questionnaire: questionnaire.items,
    game: game.items,
  };
}

describe("generation schemas", () => {
  it("accepts valid card output and rejects malformed output", () => {
    const valid = {
      cards: [{ itemKey: "c1", sourcePage: 1, prompt: { el: "Ερώτηση", en: "Question" }, answer: { el: "Απάντηση", en: "Answer" } }],
    };
    expect(cardsArtifactSchema.parse(valid).cards).toHaveLength(1);
    expect(() => cardsArtifactSchema.parse({ cards: [{ itemKey: "c1", sourcePage: 1, prompt: { el: "x" } }] })).toThrow();
  });
});

describe("topic and resource suggestion schemas", () => {
  it("accepts permissive topic lists", () => {
    expect(
      topicsArtifactSchema.parse({
        topics: { el: ["Φωτοσύνθεση", "x".repeat(200)], en: ["Photosynthesis"] },
      }).topics.el,
    ).toHaveLength(2);
  });

  it("rejects a malformed topic payload", () => {
    expect(() => topicsArtifactSchema.parse({ topics: { el: "not-an-array", en: [] } })).toThrow();
  });

  it("accepts up to twelve resource suggestions and rejects more", () => {
    const suggestion = { title: "A video", description: "Why it helps", url: "https://example.com/video" };
    expect(
      resourceSuggestionsArtifactSchema.parse({ resources: Array.from({ length: 12 }, () => suggestion) }).resources,
    ).toHaveLength(12);
    expect(() =>
      resourceSuggestionsArtifactSchema.parse({ resources: Array.from({ length: 13 }, () => suggestion) }),
    ).toThrow();
  });

  it("allows missing suggestion fields so they can be discarded individually", () => {
    const parsed = resourceSuggestionsArtifactSchema.parse({
      resources: [{ title: null, url: null }, { title: "Valid", url: "https://example.com" }],
    });
    expect(parsed.resources).toHaveLength(2);
  });
});

describe("rubric schema", () => {
  it("accepts a permissive rubric and rejects a malformed payload", () => {
    const payload = {
      criteria: [
        { id: "c1", title: { el: "Κριτήριο", en: "Criterion" }, description: { el: "Περιγραφή", en: "Description" } },
      ],
      levels: [{ id: "l1", label: { el: "Επίπεδο", en: "Level" }, description: { el: "Περιγραφή", en: "Description" } }],
    };
    expect(rubricArtifactSchema.parse(payload).criteria).toHaveLength(1);
    expect(() => rubricArtifactSchema.parse({ criteria: "bad", levels: [] })).toThrow();
  });
});

describe("mock provider topics and suggestions", () => {
  it("produces repeatable bilingual topics and satisfies the provider interface", async () => {
    const provider: ContentProvider = new MockContentProvider();
    const first = await provider.topics({ pages, sourceLocale: "en" });
    const second = await provider.topics({ pages, sourceLocale: "en" });
    expect(first.items).toEqual(second.items);
    expect(first.items.el).toEqual(first.items.en);
    expect(first.items.el.length).toBeGreaterThan(0);
    expect(first.items.el.every((topic) => topic.length > 0 && topic.length <= 40)).toBe(true);
  });

  it("produces a deterministic rubric with valid criteria and levels", async () => {
    const provider = new MockContentProvider();
    const first = await provider.rubric({
      pages,
      sourceLocale: "en",
      title: "Biology",
      topics: { el: ["Φωτοσύνθεση"], en: ["Photosynthesis"] },
      questions: ["What does photosynthesis produce?"],
    });
    const second = await provider.rubric({
      pages,
      sourceLocale: "en",
      title: "Biology",
      topics: { el: ["Φωτοσύνθεση"], en: ["Photosynthesis"] },
      questions: ["What does photosynthesis produce?"],
    });
    expect(first.items).toEqual(second.items);
    expect(first.items.criteria.length).toBeGreaterThanOrEqual(3);
    expect(first.items.levels.length).toBeGreaterThanOrEqual(3);
    expect(first.items.criteria[0].title).toHaveProperty("el");
    expect(first.items.levels[0].label).toHaveProperty("en");
  });

  it("produces parseable game and video suggestions", async () => {
    const provider = new MockContentProvider();
    const result = await provider.suggestResources({
      pages,
      sourceLocale: "en",
      title: "Biology",
      topics: { el: ["Φωτοσύνθεση"], en: ["Photosynthesis"] },
      limit: 8,
    });
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items.map((item) => item.url).every((url) => Boolean(url) && parseResourceUrl(url!).ok)).toBe(true);
    expect(result.items.some((item) => item.url?.includes("youtube"))).toBe(true);
  });
});

describe("question schemas", () => {
  const baseQuestion = {
    itemKey: "q1",
    correctOptionId: "a",
    sourcePage: 1,
    prompt: { el: "Ερώτηση", en: "Question" },
    explanation: { el: "Εξήγηση", en: "Explanation" },
  };
  const option = (id: string) => ({ id, text: `Option ${id}` });
  const trueFalse = {
    ...baseQuestion,
    type: "TRUE_FALSE" as const,
    options: {
      el: [option("a"), option("b")],
      en: [option("a"), option("b")],
    },
  };
  const multipleChoice = {
    ...baseQuestion,
    type: "MULTIPLE_CHOICE" as const,
    options: {
      el: ["a", "b", "c", "d"].map(option),
      en: ["a", "b", "c", "d"].map(option),
    },
  };

  it("accepts exactly two true/false options and four multiple-choice options", () => {
    const parsed = questionsArtifactSchema.parse({ questions: [trueFalse, multipleChoice] });
    expect(parsed.questions).toHaveLength(2);
  });

  it("rejects the wrong number of options in either locale", () => {
    expect(() =>
      questionsArtifactSchema.parse({
        questions: [
          { ...multipleChoice, options: { ...multipleChoice.options, el: multipleChoice.options.el.slice(0, 3) } },
        ],
      }),
    ).toThrow();
    expect(() =>
      questionsArtifactSchema.parse({
        questions: [{ ...trueFalse, options: { ...trueFalse.options, en: trueFalse.options.en.slice(0, 1) } }],
      }),
    ).toThrow();
  });

  it("generates JSON Schema option bounds for each question type", () => {
    const schema = zodToJsonSchema(questionsArtifactSchema, {
      target: "jsonSchema7",
      $refStrategy: "none",
    }) as unknown as {
      properties: {
        questions: {
          items: {
            anyOf: Array<{
              properties: {
                type: { const: string };
                options: { properties: { el: { minItems: number; maxItems: number } } };
              };
            }>;
          };
        };
      };
    };
    const branches = schema.properties.questions.items.anyOf.map((branch) => ({
      type: branch.properties.type.const,
      el: branch.properties.options.properties.el,
    }));

    expect(branches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "TRUE_FALSE", el: expect.objectContaining({ minItems: 2, maxItems: 2 }) }),
        expect.objectContaining({ type: "MULTIPLE_CHOICE", el: expect.objectContaining({ minItems: 4, maxItems: 4 }) }),
      ]),
    );
  });
});

describe("prompt building", () => {
  it("chunks long lessons without losing page references", () => {
    const longPages = Array.from({ length: 30 }, (_, index) => ({
      pageNumber: index + 1,
      text: `Page ${index + 1} `.repeat(200),
    }));
    const chunks = chunkPages(longPages, 5000);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.flat().map((page) => page.pageNumber)).toEqual(longPages.map((page) => page.pageNumber));
    for (const chunk of chunks) {
      expect(chunk.length).toBeGreaterThan(0);
    }
  });

  it("includes counts, page markers, and bilingual instructions", () => {
    const prompt = buildPrompt({ kind: "questionnaire", pages, counts, sourceLocale: "el" });
    expect(prompt.user).toContain("[Page 1]");
    expect(prompt.user).toContain("3-5");
    expect(prompt.user).toContain("Greek");
    expect(prompt.user).toContain("English");
    expect(prompt.promptVersion).toBe(PROMPT_VERSION);
    expect(PROMPT_VERSION).toBe("v4");
  });

  it("requires exact option counts for game questions", () => {
    const prompt = buildPrompt({ kind: "game", pages, counts, sourceLocale: "en" });
    expect(prompt.user).toContain('TRUE_FALSE has exactly two options with ids "a" and "b"');
    expect(prompt.user).toContain('MULTIPLE_CHOICE has exactly four options with ids "a","b","c","d"');
    expect(prompt.user).not.toContain("Prefer four-option");
  });

  it("builds a bilingual, source-grounded topic prompt", () => {
    const prompt = buildTopicsPrompt({ pages, sourceLocale: "el" });
    expect(prompt.user).toContain("Greek (el)");
    expect(prompt.user).toContain("English (en)");
    expect(prompt.user).toContain("3-8");
    expect(prompt.user).toContain("[Page 1]");
    expect(prompt.system).toContain("Never invent topics");
    expect(prompt.promptVersion).toBe(PROMPT_VERSION);
  });

  it("builds a suggestion prompt from the title and topics", () => {
    const prompt = buildResourceSuggestionPrompt({
      title: "Photosynthesis",
      pages,
      sourceLocale: "en",
      limit: 8,
      topics: { el: ["Φωτοσύνθεση"], en: ["Photosynthesis"] },
    });
    expect(prompt.user).toContain("Photosynthesis");
    expect(prompt.user).toContain("Φωτοσύνθεση");
    expect(prompt.user).toContain("up to 8");
    expect(prompt.user).toContain("[Page 1]");
    expect(prompt.user).toContain("student data");
    expect(prompt.system).toContain("Never invent YouTube");
  });

  it("builds an assessment-aligned bilingual rubric prompt", () => {
    const prompt = buildRubricPrompt({
      title: "Photosynthesis",
      pages,
      sourceLocale: "en",
      topics: { el: ["Φωτοσύνθεση"], en: ["Photosynthesis"] },
      questions: ["What does photosynthesis produce?"],
    });
    expect(prompt.user).toContain("3-6");
    expect(prompt.user).toContain("3-4");
    expect(prompt.user).toContain("What does photosynthesis produce?");
    expect(prompt.user).toContain("Φωτοσύνθεση");
    expect(prompt.user).toContain("[Page 1]");
    expect(prompt.system).toContain("Never include student data");
    expect(prompt.promptVersion).toBe(PROMPT_VERSION);
  });

  it("samples topic pages within the character budget without dropping pages", () => {
    const longPages = Array.from({ length: 40 }, (_, index) => ({
      pageNumber: index + 1,
      text: `Page ${index + 1} `.repeat(1000),
    }));
    const selected = selectTopicPages(longPages, 5000);
    expect(selected.map((page) => page.pageNumber)).toEqual(longPages.map((page) => page.pageNumber));
    expect(renderPageText(selected).length).toBeLessThanOrEqual(5000);
  });
});

describe("artifact validation", () => {
  it("accepts a valid mock artifact set", async () => {
    const raw = await makeRaw();
    const artifacts = validateGeneratedArtifacts(raw, pages, counts);
    expect(artifacts.cards.length).toBeGreaterThanOrEqual(2);
    expect(artifacts.questionnaire.length).toBeGreaterThanOrEqual(3);
    expect(artifacts.questionnaire[0].options.el.map((option) => option.id)).toEqual(
      artifacts.questionnaire[0].options.en.map((option) => option.id),
    );
  });

  it("rejects missing source pages, duplicate prompts, and misaligned option ids", async () => {
    const raw = await makeRaw();
    expect(() =>
      validateGeneratedArtifacts({ ...raw, cards: [{ ...raw.cards[0], sourcePage: 99 }] }, pages, counts),
    ).toThrow(/missing page/);

    expect(() =>
      validateGeneratedArtifacts(
        { ...raw, cards: [raw.cards[0], { ...raw.cards[1], prompt: raw.cards[0].prompt }] },
        pages,
        counts,
      ),
    ).toThrow(/duplicate card prompt/);

    const question = raw.questionnaire[0];
    expect(() =>
      validateGeneratedArtifacts(
        {
          ...raw,
          questionnaire: [
            {
              ...question,
              options: { ...question.options, en: question.options.en.map((option) => ({ ...option, id: `x${option.id}` })) },
            },
          ],
        },
        pages,
        counts,
      ),
    ).toThrow(/option ids/);
  });

  it("rejects an invalid correct option and out-of-range counts", async () => {
    const raw = await makeRaw();
    expect(() =>
      validateGeneratedArtifacts(
        {
          ...raw,
          questionnaire: [{ ...raw.questionnaire[0], correctOptionId: "z" }, ...raw.questionnaire.slice(1)],
        },
        pages,
        counts,
      ),
    ).toThrow(/correct option/);

    expect(() => validateGeneratedArtifacts({ ...raw, cards: raw.cards.slice(0, 1) }, pages, counts)).toThrow(/cards must contain/);
  });

  it("rejects wrong question option counts", async () => {
    const raw = await makeRaw();

    const multipleChoice = raw.game.find((question) => question.type === "MULTIPLE_CHOICE")!;
    const threeOptionGame = raw.game.map((question) =>
      question.itemKey === multipleChoice.itemKey
        ? {
            ...question,
            options: {
              el: question.options.el.slice(0, 3),
              en: question.options.en.slice(0, 3),
            },
          }
        : question,
    );
    expect(() => validateGeneratedArtifacts({ ...raw, game: threeOptionGame }, pages, counts)).toThrow(
      /must have exactly four options/,
    );

    const trueFalse = raw.game.find((question) => question.type === "TRUE_FALSE")!;
    const threeOptionTrueFalse = raw.game.map((question) =>
      question.itemKey === trueFalse.itemKey
        ? {
            ...question,
            options: {
              el: [...question.options.el, { id: "c", text: "Maybe" }],
              en: [...question.options.en, { id: "c", text: "Maybe" }],
            },
          }
        : question,
    );
    expect(() => validateGeneratedArtifacts({ ...raw, game: threeOptionTrueFalse }, pages, counts)).toThrow(
      /must have exactly two options/,
    );
  });
});

describe("PDF extraction", () => {
  it("extracts page text and returns no text for an image-only page", async () => {
    const document = await PDFDocument.create();
    const font = await document.embedFont(StandardFonts.Helvetica);
    const first = document.addPage([600, 400]);
    first.drawText("A lesson about photosynthesis and chlorophyll.", { x: 40, y: 340, size: 14, font });
    document.addPage([600, 400]);
    const bytes = new Uint8Array(await document.save());

    const extracted = await extractPdfPages(bytes);
    expect(extracted).toHaveLength(2);
    expect(extracted[0].text).toContain("photosynthesis");
    expect(extracted[1].text.trim()).toBe("");
  });
});

describe("content locale detection", () => {
  it("detects Greek and English source material", () => {
    expect(detectContentLocale("Η φωτοσύνθεση μετατρέπει την ηλιακή ενέργεια σε χημική ενέργεια.")).toBe("el");
    expect(detectContentLocale("Photosynthesis converts light energy into chemical energy.")).toBe("en");
  });
});
