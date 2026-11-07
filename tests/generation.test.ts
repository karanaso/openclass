import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import zodToJsonSchema from "zod-to-json-schema";
import { detectContentLocale } from "@/lib/locale";
import { extractPdfPages } from "@/server/pdf/extract";
import { MockContentProvider } from "@/server/generation/mock-provider";
import { buildPrompt, chunkPages } from "@/server/generation/prompts";
import { normalizeNarration } from "@/server/generation/narration";
import { cardsArtifactSchema, questionsArtifactSchema, type ContentCounts, type PromptPage } from "@/server/generation/schemas";
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
  const narration = await provider.narration(input);
  return {
    cards: cards.items,
    questionnaire: questionnaire.items,
    game: game.items,
    narration: narration.items,
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
    expect(prompt.promptVersion).toBe("v2");
  });

  it("lists exact narration pages and requires one segment per page", () => {
    const prompt = buildPrompt({ kind: "narration", pages, counts, sourceLocale: "en" });
    expect(prompt.user).toContain("pages: 1, 2");
    expect(prompt.user).toContain("exactly one narration segment");
    expect(prompt.user).toContain("no repeated page numbers");
    expect(prompt.promptVersion).toBe("v2");
  });

  it("requires exact option counts for game questions", () => {
    const prompt = buildPrompt({ kind: "game", pages, counts, sourceLocale: "en" });
    expect(prompt.user).toContain('TRUE_FALSE has exactly two options with ids "a" and "b"');
    expect(prompt.user).toContain('MULTIPLE_CHOICE has exactly four options with ids "a","b","c","d"');
    expect(prompt.user).not.toContain("Prefer four-option");
  });
});

describe("artifact validation", () => {
  it("accepts a valid mock artifact set", async () => {
    const raw = await makeRaw();
    const artifacts = validateGeneratedArtifacts(raw, pages, counts);
    expect(artifacts.cards.length).toBeGreaterThanOrEqual(2);
    expect(artifacts.questionnaire.length).toBeGreaterThanOrEqual(3);
    expect(artifacts.narration).toHaveLength(2);
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

  it("rejects unresolved narration duplicates and wrong question option counts", async () => {
    const raw = await makeRaw();
    const pageOne = raw.narration.find((segment) => segment.pageNumber === 1)!;
    const pageTwo = raw.narration.find((segment) => segment.pageNumber === 2)!;

    expect(() => validateGeneratedArtifacts({ ...raw, narration: [pageOne] }, pages, counts)).toThrow(
      /narration missing page 2/,
    );
    expect(() => validateGeneratedArtifacts({ ...raw, narration: [pageOne, pageOne, pageTwo] }, pages, counts)).toThrow(
      /duplicate narration for page 1/,
    );

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

describe("narration normalization", () => {
  it("keeps the longest duplicate and sorts pages ascending", () => {
    const short = { pageNumber: 1, script: { el: "Σύντομο", en: "Short" } };
    const long = {
      pageNumber: 1,
      script: { el: "Μεγαλύτερη αφήγηση για τη σελίδα ένα", en: "Longer narration for page one" },
    };
    const second = { pageNumber: 2, script: { el: "Σελίδα δύο", en: "Page two" } };

    const result = normalizeNarration([second, short, long], pages);

    expect(result.segments.map((segment) => segment.pageNumber)).toEqual([1, 2]);
    expect(result.segments[0]).toBe(long);
    expect(result.dropped).toEqual({ count: 1, pageNumbers: [1] });
  });

  it("keeps the first segment when duplicates tie", () => {
    const first = { pageNumber: 1, script: { el: "aaaa", en: "bbbb" } };
    const second = { pageNumber: 1, script: { el: "cccc", en: "dddd" } };

    const result = normalizeNarration([first, second], [pages[0]]);

    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]).toBe(first);
    expect(result.dropped).toEqual({ count: 1, pageNumbers: [1] });
  });

  it("keeps one copy of identical duplicate segments", () => {
    const segment = { pageNumber: 1, script: { el: "Ίδιο", en: "Same" } };

    const result = normalizeNarration([segment, { ...segment, script: { ...segment.script } }], [pages[0]]);

    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]).toEqual(segment);
    expect(result.dropped).toEqual({ count: 1, pageNumbers: [1] });
  });

  it("drops segments for pages outside the request", () => {
    const inScope = { pageNumber: 1, script: { el: "Σελίδα ένα", en: "Page one" } };
    const outOfScope = { pageNumber: 99, script: { el: "Εκτός", en: "Outside" } };

    const result = normalizeNarration([inScope, outOfScope], [pages[0]]);

    expect(result.segments.map((segment) => segment.pageNumber)).toEqual([1]);
    expect(result.dropped).toEqual({ count: 1, pageNumbers: [99] });
  });

  it("does not mutate provider segments", () => {
    const segments = [
      { pageNumber: 2, script: { el: "Δύο", en: "Two" } },
      { pageNumber: 1, script: { el: "Ένα", en: "One" } },
      { pageNumber: 1, script: { el: "Ένα ξανά", en: "One again" } },
      { pageNumber: 99, script: { el: "Εκτός", en: "Outside" } },
    ];
    const snapshot = structuredClone(segments);

    normalizeNarration(segments, pages);

    expect(segments).toEqual(snapshot);
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
