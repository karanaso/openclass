export const VISUAL_PROMPT_VERSION = "v1";
export const MAX_VISUAL_EXCERPT_CHARS = 1_200;

export type VisualPromptPage = {
  pageNumber: number;
  text: string;
};

export type VisualPromptInput = {
  title: string;
  pages: VisualPromptPage[];
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

export function buildScenePrompt(input: VisualPromptInput): string {
  return [
    "Create a wide 16:9 illustrated background scene for a school lesson video.",
    lessonContext(input),
    "Depict the lesson topic as a friendly, colorful, non-photorealistic scene that helps students recognize the subject at a glance.",
    "Style: flat editorial illustration with simple shapes, soft color, and gentle depth.",
    "Composition: keep the right third visually calm and uncluttered so a separate character can stand there; keep the left two thirds suitable as a backdrop behind a slide.",
    SAFETY_CLAUSE,
    "Do not render any characters or faces in the scene.",
  ]
    .join("\n");
}

export function buildCharacterSheetPrompt(input: VisualPromptInput): string {
  return [
    "Create one 1024x1024 PNG sprite sheet containing exactly four equal 512x512 cells in a 2x2 grid.",
    "The sheet shows the same friendly, non-human cartoon mascot character in all four cells, full body, centered in its cell, at the same scale and with both feet on the same baseline.",
    "Top-left: neutral standing pose. Top-right: the same pose with eyes closed for a blink. Bottom-left: one arm raised in a friendly wave. Bottom-right: a calm neutral pose with a slight lean.",
    "The background must be fully transparent (alpha channel), with no scenery behind the character in any cell.",
    `Give the mascot a simple visual detail that fits this lesson without adding words or symbols:\n${lessonContext(input)}`,
    "Style: bold, simple, flat cartoon shapes with clean outlines and soft, friendly colors; readable at small size.",
    SAFETY_CLAUSE,
    "Do not draw grid lines, borders, panel dividers, or pose labels between or inside the cells.",
  ].join("\n");
}
