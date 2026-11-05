import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { detectContentLocale } from "@/lib/locale";
import { extractPdfPages } from "@/server/pdf/extract";
import { MockContentProvider } from "@/server/generation/mock-provider";
import { buildPrompt, chunkPages } from "@/server/generation/prompts";
import { cardsArtifactSchema, type ContentCounts, type PromptPage } from "@/server/generation/schemas";
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
    expect(prompt.promptVersion).toBe("v1");
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
