import { describe, expect, it } from "vitest";
import type { ArtBrief } from "@/server/media/art-direction";
import {
  MAX_VISUAL_EXCERPT_CHARS,
  VISUAL_PROMPT_VERSION,
  buildCharacterSheetPrompt,
  buildScenePrompt,
  lessonExcerpt,
  type VisualPromptInput,
} from "@/server/media/image-prompts";

const brief: ArtBrief = {
  subject: "A sunlit greenhouse with broad green leaves",
  setting: "A friendly botanical classroom",
  mood: "warm and curious",
  palette: ["leaf green", "sunny yellow", "sky blue"],
  character: {
    role: "a cheerful plant guide",
    form: "a round cartoon seedling",
    outfit: "a tiny gardener apron",
    props: ["a watering can"],
  },
  sceneComposition: "Wide scene with a calm right third for the character.",
};

const input: VisualPromptInput = {
  title: "Photosynthesis",
  pages: [
    { pageNumber: 2, text: "  Plants   release oxygen.  " },
    { pageNumber: 1, text: "Chlorophyll absorbs light." },
  ],
  brief,
};

describe("lesson visual prompts", () => {
  it("uses the v2 prompt version", () => {
    expect(VISUAL_PROMPT_VERSION).toBe("v2");
  });

  it("bounds the excerpt and preserves page order", () => {
    const excerpt = lessonExcerpt(input.pages);
    expect(excerpt.startsWith("Chlorophyll absorbs light.")).toBe(true);
    expect(excerpt).toContain("Plants release oxygen.");
    expect(excerpt.length).toBeLessThanOrEqual(MAX_VISUAL_EXCERPT_CHARS);

    const long = lessonExcerpt([{ pageNumber: 1, text: "x".repeat(5_000) }]);
    expect(long).toHaveLength(MAX_VISUAL_EXCERPT_CHARS);
  });

  it("includes the lesson title, bounded excerpt, and brief in both prompts", () => {
    for (const prompt of [buildScenePrompt(input), buildCharacterSheetPrompt(input)]) {
      expect(prompt).toContain("Photosynthesis");
      expect(prompt).toContain("Chlorophyll absorbs light.");
      expect(prompt).toContain(brief.subject);
      expect(prompt).toContain(brief.setting);
      expect(prompt).toContain(brief.mood);
      expect(prompt).toContain(brief.character.form);
      expect(prompt).toContain(brief.character.outfit);
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

  it("requests a transparent 3x2 six-pose sheet", () => {
    const prompt = buildCharacterSheetPrompt(input);
    expect(prompt).toContain("1536x1024");
    expect(prompt).toContain("3x2");
    expect(prompt).toContain("transparent");
    for (const pose of ["neutral", "blink", "closed, relaxed mouth", "open mouth", "wave", "lean"]) {
      expect(prompt.toLowerCase()).toContain(pose);
    }
  });

  it("ignores student data passed outside the typed input", () => {
    const withStudentData = { ...input, studentName: "Maria", attempts: [{ score: 10 }] } as VisualPromptInput;
    const prompt = buildScenePrompt(withStudentData);
    expect(prompt).not.toContain("Maria");
    expect(prompt).not.toContain("score");
  });
});
