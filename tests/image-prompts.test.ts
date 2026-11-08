import { describe, expect, it } from "vitest";
import {
  MAX_VISUAL_EXCERPT_CHARS,
  buildCharacterSheetPrompt,
  buildScenePrompt,
  lessonExcerpt,
  type VisualPromptInput,
} from "@/server/media/image-prompts";

const input: VisualPromptInput = {
  title: "Photosynthesis",
  pages: [
    { pageNumber: 2, text: "  Plants   release oxygen.  " },
    { pageNumber: 1, text: "Chlorophyll absorbs light." },
  ],
};

describe("lesson visual prompts", () => {
  it("bounds the excerpt and preserves page order", () => {
    const excerpt = lessonExcerpt(input.pages);
    expect(excerpt.startsWith("Chlorophyll absorbs light.")).toBe(true);
    expect(excerpt).toContain("Plants release oxygen.");
    expect(excerpt.length).toBeLessThanOrEqual(MAX_VISUAL_EXCERPT_CHARS);

    const long = lessonExcerpt([{ pageNumber: 1, text: "x".repeat(5_000) }]);
    expect(long).toHaveLength(MAX_VISUAL_EXCERPT_CHARS);
  });

  it("includes the lesson title and bounded excerpt in both prompts", () => {
    for (const prompt of [buildScenePrompt(input), buildCharacterSheetPrompt(input)]) {
      expect(prompt).toContain("Photosynthesis");
      expect(prompt).toContain("Chlorophyll absorbs light.");
      expect(prompt).not.toContain("x".repeat(MAX_VISUAL_EXCERPT_CHARS + 1));
    }
  });

  it("encodes school-appropriate safety constraints", () => {
    for (const prompt of [buildScenePrompt(input), buildCharacterSheetPrompt(input)]) {
      expect(prompt).toMatch(/school-appropriate/i);
      expect(prompt).toMatch(/readable text/i);
      expect(prompt).toMatch(/logos/i);
      expect(prompt).toMatch(/real-person likenesses/i);
    }
  });

  it("requests a transparent 2x2 sprite sheet with the required poses", () => {
    const prompt = buildCharacterSheetPrompt(input);
    expect(prompt).toContain("1024x1024");
    expect(prompt).toContain("2x2");
    expect(prompt).toContain("transparent");
    expect(prompt).toMatch(/blink/i);
    expect(prompt).toMatch(/wave/i);
  });

  it("ignores student data passed outside the typed input", () => {
    const withStudentData = { ...input, studentName: "Maria", attempts: [{ score: 10 }] } as VisualPromptInput;
    const prompt = buildScenePrompt(withStudentData);
    expect(prompt).not.toContain("Maria");
    expect(prompt).not.toContain("score");
  });
});
