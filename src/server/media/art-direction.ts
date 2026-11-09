import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";
import { effectiveImageProvider, getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { extractOutputText, strictify } from "@/server/generation/openai-provider";
import { lessonExcerpt, type VisualPromptPage } from "./image-prompts";

const boundedText = (max: number) => z.string().trim().min(1).max(max);

export const artBriefSchema = z.object({
  subject: boundedText(200),
  setting: boundedText(240),
  mood: boundedText(160),
  palette: z.array(boundedText(40)).min(1).max(5),
  character: z.object({
    role: boundedText(120),
    form: boundedText(160),
    outfit: boundedText(160),
    props: z.array(boundedText(120)).max(5),
  }),
  sceneComposition: boundedText(320),
});

export type ArtBrief = z.infer<typeof artBriefSchema>;

export type ArtDirectionInput = {
  title: string;
  pages: VisualPromptPage[];
};

export type ArtBriefResult = {
  brief: ArtBrief;
  model: string;
  fallback: boolean;
};

export interface ArtDirectionProvider {
  generate(input: ArtDirectionInput): Promise<ArtBriefResult>;
}

const ART_DIRECTION_SYSTEM_PROMPT = [
  "You are an art director for a school lesson video.",
  "Return one concise, concrete visual brief that a single scene and a single friendly mascot can share.",
  "Describe visible subjects, setting, mood, a small color palette, and a non-human mascot with a role, form, outfit, and optional props.",
  "Keep it school-appropriate and friendly for children.",
  "Do not reference readable text, letters, numbers, labels, logos, brands, real people, real-person likenesses, or student data.",
].join(" ");

function artDirectionUserPrompt(input: ArtDirectionInput): string {
  const title = input.title.replace(/\s+/g, " ").trim() || "Untitled lesson";
  const excerpt = lessonExcerpt(input.pages, 800);
  return [`Lesson title: ${title}`, excerpt ? `Lesson excerpt: ${excerpt}` : ""]
    .filter(Boolean)
    .join("\n");
}

export function fallbackArtBrief(input: ArtDirectionInput): ArtBrief {
  const topic =
    input.title.replace(/\s+/g, " ").trim() ||
    lessonExcerpt(input.pages, 120).replace(/\s+/g, " ").trim() ||
    "the lesson";
  return {
    subject: `${topic} presented as a friendly illustrated lesson topic`,
    setting: `A bright, welcoming environment that clearly evokes ${topic}`,
    mood: "warm, curious, and encouraging",
    palette: ["sky blue", "leaf green", "sunny yellow", "soft coral"],
    character: {
      role: "a friendly lesson guide",
      form: "a simple non-human cartoon mascot",
      outfit: "a small accessory that matches the lesson palette",
      props: [],
    },
    sceneComposition:
      "Wide 16:9 scene with the right third calm and uncluttered so a separate character can stand there.",
  };
}

export class OpenAIArtDirectionProvider implements ArtDirectionProvider {
  async generate(input: ArtDirectionInput): Promise<ArtBriefResult> {
    const env = getEnv();
    if (!env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const model = env.OPENAI_ART_DIRECTION_MODEL ?? env.OPENAI_TEXT_MODEL;
    const jsonSchema = strictify(zodToJsonSchema(artBriefSchema, { target: "jsonSchema7", $refStrategy: "none" }));

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: ART_DIRECTION_SYSTEM_PROMPT },
          { role: "user", content: artDirectionUserPrompt(input) },
        ],
        temperature: 0.4,
        max_output_tokens: 900,
        text: {
          format: {
            type: "json_schema",
            name: "lesson_art_brief",
            strict: true,
            schema: jsonSchema,
          },
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 400);
      throw new Error(`OpenAI art-direction request failed (${response.status}): ${detail}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const text = extractOutputText(data);
    if (!text) throw new Error("OpenAI returned no art-direction text");

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("OpenAI returned invalid art-direction JSON");
    }

    return { brief: artBriefSchema.parse(parsed), model, fallback: false };
  }
}

export class MockArtDirectionProvider implements ArtDirectionProvider {
  async generate(input: ArtDirectionInput): Promise<ArtBriefResult> {
    return {
      brief: fallbackArtBrief(input),
      model: "mock-art-direction-v1",
      fallback: false,
    };
  }
}

export function getArtDirectionProvider(): ArtDirectionProvider | null {
  switch (effectiveImageProvider(getEnv())) {
    case "openai":
      return new OpenAIArtDirectionProvider();
    case "mock":
      return new MockArtDirectionProvider();
    default:
      return null;
  }
}

export async function generateArtBrief(
  input: ArtDirectionInput,
  provider: ArtDirectionProvider | null = getArtDirectionProvider(),
): Promise<ArtBriefResult> {
  if (!provider) {
    return { brief: fallbackArtBrief(input), model: "fallback", fallback: true };
  }

  try {
    return await provider.generate(input);
  } catch (error) {
    logger.warn({ err: error }, "art-direction generation failed; using the deterministic brief");
    return { brief: fallbackArtBrief(input), model: "fallback", fallback: true };
  }
}
