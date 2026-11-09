import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { buildPrompt } from "./prompts";
import type { ContentProvider, GenerationInput, ProviderResult } from "./provider";
import {
  cardsArtifactSchema,
  narrationArtifactSchema,
  questionsArtifactSchema,
  type RawCard,
  type RawNarration,
  type RawQuestion,
} from "./schemas";

export function strictify(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strictify);
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(object)) {
      result[key] = strictify(child);
    }
    if (result.type === "object" && result.properties && typeof result.properties === "object") {
      result.additionalProperties = false;
      const properties = result.properties as Record<string, unknown>;
      result.required = Object.keys(properties);
    }
    return result;
  }
  return value;
}

export function extractOutputText(data: Record<string, unknown>): string {
  if (typeof data.output_text === "string" && data.output_text.length > 0) return data.output_text;
  const output = data.output as Array<{ content?: Array<{ type?: string; text?: string }> }> | undefined;
  return (output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text!)
    .join("");
}

export class OpenAIContentProvider implements ContentProvider {
  private async call<T>(
    name: string,
    schema: z.ZodType<T>,
    input: GenerationInput,
  ): Promise<{ parsed: T; model: string; inputTokens: number; outputTokens: number }> {
    const env = getEnv();
    if (!env.OPENAI_API_KEY) {
      throw new AppError("missing_openai_key", "OPENAI_API_KEY is not configured", 500);
    }

    const prompt = buildPrompt(input);
    const jsonSchema = strictify(zodToJsonSchema(schema, { target: "jsonSchema7", $refStrategy: "none" }));

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: env.OPENAI_TEXT_MODEL,
        input: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        temperature: 0.2,
        max_output_tokens: 16_000,
        text: {
          format: {
            type: "json_schema",
            name,
            strict: true,
            schema: jsonSchema,
          },
        },
      }),
      signal: AbortSignal.timeout(180_000),
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 400);
      throw new Error(`OpenAI request failed (${response.status}): ${detail}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    const text = extractOutputText(data);
    if (!text) {
      throw new Error("OpenAI returned no output text");
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(text);
    } catch {
      throw new Error("OpenAI returned invalid JSON");
    }

    const usage = data.usage as { input_tokens?: number; output_tokens?: number } | undefined;
    return {
      parsed: schema.parse(parsedJson),
      model: env.OPENAI_TEXT_MODEL,
      inputTokens: usage?.input_tokens ?? Math.ceil(prompt.user.length / 4),
      outputTokens: usage?.output_tokens ?? Math.ceil(text.length / 4),
    };
  }

  async cards(input: GenerationInput): Promise<ProviderResult<RawCard[]>> {
    const result = await this.call("lesson_cards", cardsArtifactSchema, input);
    return {
      items: result.parsed.cards,
      usage: { model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens },
    };
  }

  async questions(input: GenerationInput, mode: "questionnaire" | "game"): Promise<ProviderResult<RawQuestion[]>> {
    const result = await this.call(`${mode}_questions`, questionsArtifactSchema, { ...input, kind: mode });
    return {
      items: result.parsed.questions,
      usage: { model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens },
    };
  }

  async narration(input: GenerationInput): Promise<ProviderResult<RawNarration[]>> {
    const result = await this.call("lesson_narration", narrationArtifactSchema, input);
    return {
      items: result.parsed.segments,
      usage: { model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens },
    };
  }
}
