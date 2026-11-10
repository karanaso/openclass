import { readFile } from "node:fs/promises";
import path from "node:path";
import { effectiveImageProvider, getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { buildCharacterSheetPrompt, buildScenePrompt, type VisualPromptInput } from "./image-prompts";

export type GeneratedImage = {
  data: Uint8Array;
  extension: "png";
  model: string;
};

export interface ImageProvider {
  generateScene(input: VisualPromptInput): Promise<GeneratedImage>;
  generateCharacterSheet(input: VisualPromptInput): Promise<GeneratedImage>;
}

type ImageResponse = {
  data?: Array<{ b64_json?: string; url?: string }>;
  error?: { message?: string };
};

function isMissingModelError(status: number, detail: string): boolean {
  return status === 400 && /model/i.test(detail) && /(does not exist|not found|unknown|unsupported|invalid)/i.test(detail);
}

async function readImageResponse(response: Response, model: string): Promise<Uint8Array> {
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 400);
    if (isMissingModelError(response.status, detail)) {
      throw new AppError(
        "image_model_unavailable",
        `The image model "${model}" is not available to the configured account. Set OPENAI_IMAGE_MODEL to a model the account exposes (verify with GET /v1/models).`,
        500,
        { model },
      );
    }
    throw new Error(`OpenAI image request failed (${response.status}): ${detail}`);
  }

  const payload = (await response.json()) as ImageResponse;
  const item = payload.data?.[0];
  if (item?.b64_json) {
    return new Uint8Array(Buffer.from(item.b64_json, "base64"));
  }
  if (item?.url) {
    const download = await fetch(item.url, { signal: AbortSignal.timeout(120_000) });
    if (!download.ok) {
      throw new Error(`Could not download generated image (${download.status})`);
    }
    return new Uint8Array(await download.arrayBuffer());
  }
  throw new Error(payload.error?.message ?? "OpenAI image response contained no image");
}

export class OpenAIImageProvider implements ImageProvider {
  private async generate(prompt: string, options: { size: string; transparent?: boolean }): Promise<GeneratedImage> {
    const env = getEnv();
    if (!env.OPENAI_API_KEY) {
      throw new AppError("missing_openai_key", "OPENAI_API_KEY is not configured", 500);
    }

    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: env.OPENAI_IMAGE_MODEL,
        prompt,
        n: 1,
        size: options.size,
        quality: env.OPENAI_IMAGE_QUALITY,
        output_format: "png",
        ...(options.transparent ? { background: "transparent" } : {}),
      }),
      signal: AbortSignal.timeout(180_000),
    });

    return {
      data: await readImageResponse(response, env.OPENAI_IMAGE_MODEL),
      extension: "png",
      model: env.OPENAI_IMAGE_MODEL,
    };
  }

  async generateScene(input: VisualPromptInput): Promise<GeneratedImage> {
    return this.generate(buildScenePrompt(input), { size: "1536x1024" });
  }

  async generateCharacterSheet(input: VisualPromptInput): Promise<GeneratedImage> {
    return this.generate(buildCharacterSheetPrompt(input), { size: "1536x1024", transparent: true });
  }
}

async function readFixture(name: string): Promise<Uint8Array> {
  const filePath = path.join(process.cwd(), "src", "server", "media", "fixtures", name);
  return new Uint8Array(await readFile(filePath));
}

export class MockImageProvider implements ImageProvider {
  async generateScene(_input: VisualPromptInput): Promise<GeneratedImage> {
    return { data: await readFixture("mock-scene.png"), extension: "png", model: "mock-image-v1" };
  }

  async generateCharacterSheet(_input: VisualPromptInput): Promise<GeneratedImage> {
    return {
      data: await readFixture("mock-character-sheet.png"),
      extension: "png",
      model: "mock-image-v1",
    };
  }
}

export function getImageProvider(): ImageProvider | null {
  const env = getEnv();
  switch (effectiveImageProvider(env)) {
    case "openai":
      return new OpenAIImageProvider();
    case "mock":
      return new MockImageProvider();
    default:
      return null;
  }
}
