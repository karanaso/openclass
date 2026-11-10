import type {
  NormalizedStoryScene,
  RawStory,
  StoryNormalizationResult,
  StoryPage,
} from "./schemas";

export type NormalizeStoryOptions = {
  minScenes: number;
  maxScenes: number;
};

export function substantivePages(pages: StoryPage[]): StoryPage[] {
  return pages.filter((page) => page.text.replace(/\s/g, "").length > 20);
}

export function normalizeStory(
  raw: RawStory,
  pages: StoryPage[],
  options: NormalizeStoryOptions,
): StoryNormalizationResult {
  const errors: string[] = [];
  const pageNumbers = new Set(pages.map((page) => page.pageNumber));
  const sceneKeys = new Set<string>();
  const droppedSceneKeys: string[] = [];
  const scenes: NormalizedStoryScene[] = [];

  const title = raw.title.trim();
  const logline = raw.logline.trim();
  if (!title) errors.push("story title is empty");
  if (!logline) errors.push("story logline is empty");

  for (const scene of raw.scenes) {
    const sceneKey = scene.sceneKey.trim();
    if (sceneKeys.has(sceneKey)) {
      droppedSceneKeys.push(sceneKey);
      continue;
    }
    const narrationEl = scene.narration.el.trim();
    const narrationEn = scene.narration.en.trim();
    if (!narrationEl || !narrationEn) {
      errors.push(`scene ${sceneKey || "(unnamed)"} is missing narration in one or both locales`);
      continue;
    }

    const sourcePages = [...new Set(scene.sourcePages)].sort((a, b) => a - b);
    if (sourcePages.length === 0) {
      errors.push(`scene ${sceneKey} has no source pages`);
      continue;
    }
    const invalidPages = sourcePages.filter((page) => !pageNumbers.has(page));
    if (invalidPages.length > 0) {
      errors.push(`scene ${sceneKey} cites missing page ${invalidPages.join(", ")}`);
      continue;
    }

    sceneKeys.add(sceneKey);
    scenes.push({
      position: scenes.length,
      sceneKey,
      sourcePages,
      narration: { el: narrationEl, en: narrationEn },
      ...(scene.visualDirection?.trim() ? { visualDirection: scene.visualDirection.trim() } : {}),
    });
  }

  if (scenes.length < options.minScenes || scenes.length > options.maxScenes) {
    errors.push(
      `story must contain ${options.minScenes}-${options.maxScenes} scenes (received ${scenes.length})`,
    );
  }

  const citedPages = new Set(scenes.flatMap((scene) => scene.sourcePages));
  const missingPageNumbers = substantivePages(pages)
    .filter((page) => !citedPages.has(page.pageNumber))
    .map((page) => page.pageNumber);

  if (missingPageNumbers.length > 0) {
    errors.push(`story does not cover page ${missingPageNumbers.join(", ")}`);
  }

  return {
    story: { title, logline, scenes },
    errors,
    missingPageNumbers,
    droppedSceneKeys,
    ok: errors.length === 0,
  };
}
