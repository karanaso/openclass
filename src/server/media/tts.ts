import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";

export type TtsResult = {
  data: Uint8Array;
  extension: "mp3" | "wav";
  durationMs?: number;
};

export interface TtsProvider {
  synthesize(text: string, locale: "el" | "en"): Promise<TtsResult>;
}

function wavFromTone(text: string): TtsResult {
  const seconds = Math.min(8, Math.max(1.2, text.length / 18));
  const sampleRate = 22050;
  const samples = Math.round(seconds * sampleRate);
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index += 1) {
    const sample = Math.sin((2 * Math.PI * 220 * index) / sampleRate) * 1200;
    buffer.writeInt16LE(Math.round(sample), 44 + index * 2);
  }
  return { data: new Uint8Array(buffer), extension: "wav", durationMs: Math.round(seconds * 1000) };
}

export class MockTtsProvider implements TtsProvider {
  async synthesize(text: string): Promise<TtsResult> {
    return wavFromTone(text);
  }
}

export class OpenAITtsProvider implements TtsProvider {
  async synthesize(text: string, locale: "el" | "en"): Promise<TtsResult> {
    const env = getEnv();
    if (!env.OPENAI_API_KEY) {
      throw new AppError("missing_openai_key", "OPENAI_API_KEY is not configured", 500);
    }
    const voice = locale === "el" ? env.OPENAI_TTS_VOICE_EL : env.OPENAI_TTS_VOICE_EN;
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: env.OPENAI_TTS_MODEL,
        voice,
        input: text.slice(0, 4000),
        response_format: "mp3",
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(`OpenAI TTS failed (${response.status}): ${detail}`);
    }
    return { data: new Uint8Array(await response.arrayBuffer()), extension: "mp3" };
  }
}

export function getTtsProvider(): TtsProvider {
  return getEnv().TTS_PROVIDER === "mock" ? new MockTtsProvider() : new OpenAITtsProvider();
}
