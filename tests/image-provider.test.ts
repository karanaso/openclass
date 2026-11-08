import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/lib/env";
import {
  MockImageProvider,
  OpenAIImageProvider,
  getImageProvider,
} from "@/server/media/image";
import type { VisualPromptInput } from "@/server/media/image-prompts";

const execFileAsync = promisify(execFile);

const promptInput: VisualPromptInput = {
  title: "Photosynthesis",
  pages: [{ pageNumber: 1, text: "Chlorophyll absorbs light." }],
};

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/db";
  process.env.AUTH_SECRET = "a".repeat(40);
  process.env.TEACHER_PASSWORD = "secret";
  process.env.AI_PROVIDER = "mock";
  process.env.TTS_PROVIDER = "mock";
  process.env.OPENAI_API_KEY = "sk-test";
  delete process.env.IMAGE_PROVIDER;
  resetEnvCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...originalEnv };
  resetEnvCache();
});

describe("image provider factory", () => {
  it("follows AI_PROVIDER when IMAGE_PROVIDER is unset", () => {
    expect(getImageProvider()).toBeInstanceOf(MockImageProvider);
  });

  it("honors an explicit mock or disabled selection", () => {
    process.env.IMAGE_PROVIDER = "mock";
    resetEnvCache();
    expect(getImageProvider()).toBeInstanceOf(MockImageProvider);

    process.env.IMAGE_PROVIDER = "disabled";
    resetEnvCache();
    expect(getImageProvider()).toBeNull();
  });

  it("selects the OpenAI provider when requested", () => {
    process.env.IMAGE_PROVIDER = "openai";
    resetEnvCache();
    expect(getImageProvider()).toBeInstanceOf(OpenAIImageProvider);
  });
});

describe("mock image provider", () => {
  it("returns deterministic fixtures with the required dimensions and alpha", async () => {
    const provider = new MockImageProvider();
    const scene = await provider.generateScene(promptInput);
    const sheet = await provider.generateCharacterSheet(promptInput);

    expect(scene.model).toBe("mock-image-v1");
    expect(sheet.model).toBe("mock-image-v1");
    expect(scene.data.byteLength).toBeGreaterThan(100);
    const repeated = await provider.generateScene(promptInput);
    expect(Buffer.from(repeated.data).equals(Buffer.from(scene.data))).toBe(true);

    const fixtureDir = path.join(process.cwd(), "src", "server", "media", "fixtures");
    const probe = async (file: string) =>
      (
        await execFileAsync("ffprobe", [
          "-v",
          "error",
          "-show_entries",
          "stream=width,height,pix_fmt",
          "-of",
          "default=noprint_wrappers=1",
          path.join(fixtureDir, file),
        ])
      ).stdout;

    expect(await probe("mock-scene.png")).toBe("width=1536\nheight=1024\npix_fmt=rgb24\n");
    expect(await probe("mock-character-sheet.png")).toBe("width=1024\nheight=1024\npix_fmt=rgba\n");
  });
});

describe("OpenAI image provider", () => {
  it("sends the configured scene request", async () => {
    process.env.IMAGE_PROVIDER = "openai";
    process.env.OPENAI_IMAGE_MODEL = "gpt-image-test";
    process.env.OPENAI_IMAGE_QUALITY = "low";
    resetEnvCache();

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ b64_json: Buffer.from("png").toString("base64") }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new OpenAIImageProvider().generateScene(promptInput);
    expect(result.model).toBe("gpt-image-test");
    expect(Buffer.from(result.data).toString()).toBe("png");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/images/generations");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk-test");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      model: "gpt-image-test",
      n: 1,
      size: "1536x1024",
      quality: "low",
      output_format: "png",
    });
    expect(body.background).toBeUndefined();
    expect(body.prompt).toContain("Photosynthesis");
  });

  it("requests a transparent 1024x1024 character sheet", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ b64_json: Buffer.from("png").toString("base64") }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await new OpenAIImageProvider().generateCharacterSheet(promptInput);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.size).toBe("1024x1024");
    expect(body.background).toBe("transparent");
    expect(body.output_format).toBe("png");
  });

  it("propagates provider errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("moderation blocked", { status: 400 })));
    await expect(new OpenAIImageProvider().generateScene(promptInput)).rejects.toThrow(/400/);
  });
});
