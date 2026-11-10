import { renderPageText } from "@/server/generation/prompts";
import type { StoryGenerationInput } from "@/server/generation/provider";

export const STORY_PROMPT_VERSION = "story-v1";

const SYSTEM = [
  "You are a storyteller for a school lesson video.",
  "You turn source-grounded lesson material into one coherent, child-appropriate narrative arc.",
  "Use only facts, names, numbers, and relationships supported by the supplied page text.",
  "Do not invent facts, quotes, people, or events.",
  "Every scene must cite the source pages that support it.",
  "Return only valid JSON matching the requested schema.",
].join(" ");

function localeInstruction(sourceLocale: "el" | "en"): string {
  return sourceLocale === "el"
    ? "The lesson's primary language is Greek. Write a natural Greek narration and an English translation with the same meaning."
    : "The lesson's primary language is English. Write a natural English narration and a Greek translation with the same meaning.";
}

function draftPrompt(input: StoryGenerationInput): string {
  return [
    input.title ? `Lesson title: ${input.title}` : "",
    localeInstruction(input.sourceLocale),
    "Write the draft story beats for the supplied section.",
    "Each scene has sceneKey, sourcePages, narration {el,en}, and optional visualDirection.",
    "Narration should be 2-5 spoken sentences per scene and should explain the material in story form, not read the page verbatim.",
    "Use sourcePages numbers that exist in the supplied text. Do not cite pages outside this section.",
    "If this is one section of a longer lesson, write beats for this section only and do not force an opening or closing.",
    "Source text:",
    renderPageText(input.pages),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function mergePrompt(input: StoryGenerationInput): string {
  const beats = (input.beats ?? []).map((beat) => ({
    sceneKey: beat.sceneKey,
    sourcePages: beat.sourcePages,
    narration: beat.narration,
    visualDirection: beat.visualDirection,
  }));
  const pages = input.pages.map((page) => `[Page ${page.pageNumber}]`).join(", ");
  return [
    input.title ? `Lesson title: ${input.title}` : "",
    localeInstruction(input.sourceLocale),
    "Merge the supplied section beats into one continuous story with a clear opening, development, and closing.",
    "Do not concatenate the beats. Rewrite transitions so the result reads as one narrative, while preserving every supported fact and every cited page.",
    "Return title, logline, and ordered scenes. Each scene has sceneKey, sourcePages, narration {el,en}, and optional visualDirection.",
    "Every scene must cite source pages that exist in the lesson. Every substantive source page must be represented by at least one scene.",
    `Available lesson pages: ${pages}`,
    "Section beats:",
    JSON.stringify(beats, null, 2),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function repairPrompt(input: StoryGenerationInput): string {
  const notes = input.repairNotes?.length ? input.repairNotes.join("\n- ") : "The story did not cover every page.";
  const missing = input.missingPageNumbers?.length
    ? `Pages still missing from the story: ${input.missingPageNumbers.join(", ")}.`
    : "";
  return [
    input.title ? `Lesson title: ${input.title}` : "",
    localeInstruction(input.sourceLocale),
    "Repair the supplied story. Keep the scenes that already satisfy the contract, fix the listed problems, and add scenes for missing pages.",
    "Return the complete corrected story, not a patch. Each scene has sceneKey, sourcePages, narration {el,en}, and optional visualDirection.",
    "Every scene must cite source pages that exist in the lesson. Every substantive source page must be represented by at least one scene.",
    `Problems:\n- ${notes}`,
    missing,
    "Existing story:",
    JSON.stringify(input.existing ?? null, null, 2),
    "Source text for missing pages:",
    renderPageText(input.pages),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildStoryPrompt(input: StoryGenerationInput): {
  system: string;
  user: string;
  promptVersion: string;
} {
  const user =
    input.mode === "merge" ? mergePrompt(input) : input.mode === "repair" ? repairPrompt(input) : draftPrompt(input);
  return { system: SYSTEM, user, promptVersion: STORY_PROMPT_VERSION };
}
