import type { ArtBrief } from "./art-direction";

export const VISUAL_PROMPT_VERSION = "v2";
export const MAX_VISUAL_EXCERPT_CHARS = 1_200;

export type VisualPromptPage = {
  pageNumber: number;
  text: string;
};

export type VisualPromptInput = {
  title: string;
  pages: VisualPromptPage[];
  brief?: ArtBrief;
};

export function lessonExcerpt(pages: VisualPromptPage[], limit = MAX_VISUAL_EXCERPT_CHARS): string {
  const combined = [...pages]
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .map((page) => page.text.replace(/\s+/g, " ").trim())
    .filter((text) => text.length > 0)
    .join(" ");
  return combined.slice(0, Math.max(0, limit));
}

const SAFETY_CLAUSE =
  "The image must be school-appropriate and friendly for children. Do not include any readable text, letters, numbers, labels, captions, speech bubbles, logos, brands, watermarks, or real-person likenesses.";

function lessonContext(input: VisualPromptInput): string {
  const excerpt = lessonExcerpt(input.pages);
  return [
    `Lesson title: ${input.title.replace(/\s+/g, " ").trim()}`,
    excerpt ? `Lesson text excerpt: ${excerpt}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function briefContext(input: VisualPromptInput): string {
  const brief = input.brief;
  if (!brief) {
    return [
      `Subject: ${input.title.replace(/\s+/g, " ").trim() || "the lesson topic"}`,
      "Setting: a friendly illustrated environment inspired by the lesson excerpt",
      "Mood: warm, curious, and encouraging",
      "Palette: sky blue, leaf green, sunny yellow, and soft coral",
    ].join("\n");
  }

  return [
    `Subject: ${brief.subject}`,
    `Setting: ${brief.setting}`,
    `Mood: ${brief.mood}`,
    `Palette: ${brief.palette.join(", ")}`,
    `Character role: ${brief.character.role}`,
    `Character form: ${brief.character.form}`,
    `Character outfit: ${brief.character.outfit}`,
    brief.character.props.length > 0 ? `Character props: ${brief.character.props.join(", ")}` : "",
    `Scene composition: ${brief.sceneComposition}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildScenePrompt(input: VisualPromptInput): string {
  return [
    "Create a wide 16:9 illustrated background scene for a school lesson video.",
    lessonContext(input),
    briefContext(input),
    "Depict the brief as a friendly, colorful, non-photorealistic scene that helps students recognize the subject at a glance.",
    "Style: polished flat editorial illustration with clean shapes, layered depth, soft lighting, and a cohesive palette.",
    "Composition: keep the right third visually calm and uncluttered so a separate character can stand there; keep the left two thirds suitable as a backdrop behind a slide.",
    SAFETY_CLAUSE,
    "Do not render any characters, mascots, or faces in the scene.",
  ]
    .join("\n");
}

export function buildCharacterSheetPrompt(input: VisualPromptInput): string {
  return [
    "Create one 1536x1024 PNG sprite sheet containing exactly six equal 512x512 cells arranged in a 3x2 grid (three columns, two rows).",
    "The sheet shows the same friendly, non-human cartoon mascot character in all six cells, full body, centered in its cell, at the same scale, with the same proportions, outfit, palette, and both feet on the same baseline.",
    "Top row, left to right: neutral standing pose; the same pose with eyes closed for a blink; the same pose with a closed, relaxed mouth.",
    "Bottom row, left to right: the same pose with an open mouth as if speaking; one arm raised in a friendly wave; a calm neutral pose with a slight lean.",
    lessonContext(input),
    briefContext(input),
    "The background must be fully transparent (alpha channel), with no scenery behind the character in any cell.",
    "Style: bold, simple, flat cartoon shapes with clean outlines and soft, friendly colors; readable at small size.",
    SAFETY_CLAUSE,
    "Do not draw grid lines, borders, panel dividers, or pose labels between or inside the cells.",
  ].join("\n");
}
