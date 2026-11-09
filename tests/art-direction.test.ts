import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/lib/env";
import {
  MockArtDirectionProvider,
  OpenAIArtDirectionProvider,
  fallbackArtBrief,
  generateArtBrief,
  type ArtDirectionInput,
} from "@/server/media/art-direction";

const input: ArtDirectionInput = {
  title: "Photosynthesis",
  pages: [{ pageNumber: 1, text: "Chlorophyll absorbs light and plants release oxygen." }],
};

const validBrief = {
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

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = {
    ...originalEnv,
    DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
    AUTH_SECRET: "a".repeat(40),
    TEACHER_PASSWORD: "secret",
    AI_PROVIDER: "openai",
    TTS_PROVIDER: "mock",
    IMAGE_PROVIDER: "openai",
    OPENAI_API_KEY: "sk-test",
    OPENAI_TEXT_MODEL: "gpt-4.1-mini",
    OPENAI_ART_DIRECTION_MODEL: "gpt-art-test",
  };
  resetEnvCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...originalEnv };
  resetEnvCache();
});

describe("art-direction provider", () => {
  it("returns a validated brief from the configured text model", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ output_text: JSON.stringify(validBrief) }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new OpenAIArtDirectionProvider().generate(input);
    expect(result.brief).toEqual(validBrief);
    expect(result.model).toBe("gpt-art-test");
    expect(result.fallback).toBe(false);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("gpt-art-test");
    expect(body.text.format.name).toBe("lesson_art_brief");
    expect(body.text.format.strict).toBe(true);
    expect(body.input[1].content).toContain("Photosynthesis");
  });

  it("falls back when the model returns invalid JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ output_text: "not json" }), { status: 200 })),
    );

    const result = await generateArtBrief(input, new OpenAIArtDirectionProvider());
    expect(result.fallback).toBe(true);
    expect(result.model).toBe("fallback");
    expect(result.brief.subject).toContain("Photosynthesis");
  });

  it("falls back when the provider request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("moderation blocked", { status: 400 })));

    const result = await generateArtBrief(input, new OpenAIArtDirectionProvider());
    expect(result.fallback).toBe(true);
    expect(result.brief.setting.length).toBeGreaterThan(0);
  });

  it("falls back without calling a provider when images are disabled", async () => {
    process.env.IMAGE_PROVIDER = "disabled";
    resetEnvCache();
    const result = await generateArtBrief(input, null);
    expect(result.fallback).toBe(true);
    expect(result.model).toBe("fallback");
  });

  it("uses a deterministic mock brief", async () => {
    const provider = new MockArtDirectionProvider();
    const first = await provider.generate(input);
    const second = await provider.generate(input);
    expect(first.brief).toEqual(second.brief);
    expect(first.model).toBe("mock-art-direction-v1");
  });

  it("never includes student data in the fallback brief", () => {
    const withStudentData = {
      ...input,
      studentName: "Maria",
      attempts: [{ score: 10 }],
    } as ArtDirectionInput;
    const brief = JSON.stringify(fallbackArtBrief(withStudentData));
    expect(brief).not.toContain("Maria");
    expect(brief).not.toContain("score");
  });
});
