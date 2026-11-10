import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockContentProvider } from "@/server/generation/mock-provider";
import { OpenAIContentProvider } from "@/server/generation/openai-provider";
import { resetEnvCache } from "@/lib/env";
import { chunkStoryPages } from "@/server/story/chunking";
import { normalizeStory } from "@/server/story/normalize";
import { buildStoryPrompt } from "@/server/story/prompts";
import { rawStorySchema, type RawStory, type StoryPage } from "@/server/story/schemas";

const pages: StoryPage[] = [
  { pageNumber: 1, text: "Photosynthesis converts light energy into chemical energy in plants." },
  { pageNumber: 2, text: "Cellular respiration releases energy from glucose inside mitochondria." },
  { pageNumber: 3, text: "Together these processes cycle energy through living systems." },
];

function story(overrides: Partial<RawStory> = {}): RawStory {
  return {
    title: "The Energy Journey",
    logline: "How plants and animals move energy through life.",
    scenes: [
      {
        sceneKey: "scene-1",
        sourcePages: [1],
        narration: { el: "Η φωτοσύνθεση ξεκινά το ταξίδι.", en: "Photosynthesis starts the journey." },
      },
      {
        sceneKey: "scene-2",
        sourcePages: [2],
        narration: { el: "Η αναπνοή απελευθερώνει ενέργεια.", en: "Respiration releases energy." },
      },
      {
        sceneKey: "scene-3",
        sourcePages: [3],
        narration: { el: "Η ενέργεια συνεχίζει τον κύκλο.", en: "Energy continues the cycle." },
      },
    ],
    ...overrides,
  };
}

describe("story schemas", () => {
  it("accepts a bilingual story with page anchors", () => {
    expect(rawStorySchema.parse(story()).scenes).toHaveLength(3);
  });

  it("rejects empty narration and invalid page arrays", () => {
    expect(() =>
      rawStorySchema.parse(
        story({
          scenes: [
            {
              sceneKey: "scene-1",
              sourcePages: [1],
              narration: { el: "", en: "English" },
            },
          ],
        }),
      ),
    ).toThrow();
    expect(() =>
      rawStorySchema.parse(
        story({
          scenes: [
            {
              sceneKey: "scene-1",
              sourcePages: [],
              narration: { el: "Ελληνικά", en: "English" },
            },
          ],
        }),
      ),
    ).toThrow();
  });
});

describe("story normalization", () => {
  it("renumbers scenes in returned order and drops duplicate keys", () => {
    const result = normalizeStory(
      story({
        scenes: [
          ...story().scenes,
          {
            sceneKey: "scene-1",
            sourcePages: [1],
            narration: { el: "Διπλό", en: "Duplicate" },
          },
        ],
      }),
      pages,
      { minScenes: 3, maxScenes: 20 },
    );

    expect(result.ok).toBe(true);
    expect(result.story.scenes.map((scene) => scene.position)).toEqual([0, 1, 2]);
    expect(result.droppedSceneKeys).toEqual(["scene-1"]);
  });

  it("rejects a scene that cites a missing page and reports coverage", () => {
    const result = normalizeStory(
      story({
        scenes: [
          { ...story().scenes[0], sceneKey: "scene-1", sourcePages: [99] },
          story().scenes[1],
        ],
      }),
      pages,
      { minScenes: 2, maxScenes: 20 },
    );

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/missing page 99/);
    expect(result.missingPageNumbers).toContain(1);
    expect(result.missingPageNumbers).toContain(3);
  });

  it("reports missing locales and scene-limit violations", () => {
    const result = normalizeStory(
      story({
        scenes: [
          {
            sceneKey: "scene-1",
            sourcePages: [1],
            narration: { el: "Ελληνικά", en: "  " },
          },
        ],
      }),
      pages,
      { minScenes: 3, maxScenes: 5 },
    );

    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/missing narration/);
    expect(result.errors.join(" ")).toMatch(/3-5 scenes/);
  });

  it("requires substantive pages to be covered", () => {
    const result = normalizeStory(
      story({ scenes: [story().scenes[0], story().scenes[1]] }),
      pages,
      { minScenes: 2, maxScenes: 20 },
    );

    expect(result.ok).toBe(false);
    expect(result.missingPageNumbers).toEqual([3]);
  });
});

describe("story chunking", () => {
  it("splits a page that exceeds the budget without dropping its text", () => {
    const longPage = { pageNumber: 1, text: "A".repeat(200) };
    const chunks = chunkStoryPages([longPage], 80);
    const joined = chunks.flat().map((page) => page.text).join("");

    expect(chunks.length).toBeGreaterThan(1);
    expect(joined).toBe(longPage.text);
    expect(chunks.flat().every((page) => page.pageNumber === 1)).toBe(true);
  });
});

describe("story prompts and mock provider", () => {
  it("includes page markers and repair notes in the prompt", () => {
    const draft = buildStoryPrompt({ mode: "draft", pages, sourceLocale: "en", title: "Energy" });
    expect(draft.user).toContain("[Page 1]");
    expect(draft.promptVersion).toBe("story-v1");

    const repair = buildStoryPrompt({
      mode: "repair",
      pages: [pages[2]],
      sourceLocale: "en",
      existing: story(),
      repairNotes: ["story does not cover page 3"],
      missingPageNumbers: [3],
    });
    expect(repair.user).toContain("story does not cover page 3");
    expect(repair.user).toContain("[Page 3]");
  });

  it("produces a source-covering bilingual story with the mock provider", async () => {
    const result = await new MockContentProvider().story({
      mode: "draft",
      pages,
      sourceLocale: "en",
      title: "Energy",
    });
    const normalized = normalizeStory(result.items, pages, { minScenes: 3, maxScenes: 20 });

    expect(normalized.ok).toBe(true);
    expect(normalized.story.scenes.length).toBeGreaterThanOrEqual(3);
    expect(normalized.story.scenes.every((scene) => scene.narration.el && scene.narration.en)).toBe(true);
    expect(new Set(normalized.story.scenes.flatMap((scene) => scene.sourcePages))).toEqual(new Set([1, 2, 3]));
  });

  it("returns merged beats as one story", async () => {
    const result = await new MockContentProvider().story({
      mode: "merge",
      pages,
      sourceLocale: "el",
      title: "Energy",
      beats: story().scenes,
    });

    expect(result.items.title).toBe("Energy");
    expect(result.items.scenes.map((scene) => scene.sceneKey)).toEqual(["scene-1", "scene-2", "scene-3"]);
  });
});

describe("OpenAI story provider", () => {
  const baseEnv = {
    DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
    AUTH_SECRET: "a".repeat(40),
    TEACHER_PASSWORD: "secret",
    AI_PROVIDER: "mock",
    TTS_PROVIDER: "mock",
    OPENAI_API_KEY: "sk-test",
  };

  beforeEach(() => {
    for (const [key, value] of Object.entries(baseEnv)) process.env[key] = value;
    resetEnvCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of Object.keys(baseEnv)) delete process.env[key];
    resetEnvCache();
  });

  it("requests a structured story with the configured story model", async () => {
    process.env.STORY_MODEL = "story-model-test";
    resetEnvCache();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: JSON.stringify(story()),
          usage: { input_tokens: 12, output_tokens: 34 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new OpenAIContentProvider().story({
      mode: "draft",
      pages,
      sourceLocale: "en",
      title: "Energy",
    });

    expect(result.items.title).toBe("The Energy Journey");
    expect(result.usage).toEqual({ model: "story-model-test", inputTokens: 12, outputTokens: 34 });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.model).toBe("story-model-test");
    expect(body.text.format.name).toBe("lesson_story");
    expect(body.input[1].content).toContain("[Page 1]");
  });
});
