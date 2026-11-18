import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/lib/env";
import { OpenAIContentProvider } from "@/server/generation/openai-provider";

const pages = [{ pageNumber: 1, text: "Photosynthesis turns light into chemical energy." }];

function response(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      output_text: JSON.stringify(payload),
      usage: { input_tokens: 12, output_tokens: 7 },
    }),
  } as Response;
}

beforeEach(() => {
  process.env.DATABASE_URL = "postgresql://localhost:5432/test";
  process.env.AUTH_SECRET = "a".repeat(40);
  process.env.TEACHER_PASSWORD = "test";
  process.env.OPENAI_API_KEY = "test-key";
  process.env.OPENAI_TEXT_MODEL = "gpt-4.1-mini";
  resetEnvCache();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetEnvCache();
});

describe("OpenAI provider topics and suggestions", () => {
  it("requests lesson topics with the strict topic schema", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      response({ topics: { el: ["Φωτοσύνθεση"], en: ["Photosynthesis"] } }),
    );

    const provider = new OpenAIContentProvider();
    const result = await provider.topics({ pages, sourceLocale: "en" });

    expect(result.items).toEqual({ el: ["Φωτοσύνθεση"], en: ["Photosynthesis"] });
    expect(result.usage).toEqual({ model: "gpt-4.1-mini", inputTokens: 12, outputTokens: 7 });

    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(body.text.format.name).toBe("lesson_topics");
    expect(body.text.format.strict).toBe(true);
    expect(body.input[1].content).toContain("[Page 1]");
  });

  it("requests a rubric with the strict rubric schema", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      response({
        criteria: [
          { id: "c1", title: { el: "Κριτήριο", en: "Criterion" }, description: { el: "Περιγραφή", en: "Description" } },
        ],
        levels: [{ id: "l1", label: { el: "Επίπεδο", en: "Level" }, description: { el: "Περιγραφή", en: "Description" } }],
      }),
    );

    const provider = new OpenAIContentProvider();
    const result = await provider.rubric({
      pages,
      sourceLocale: "en",
      title: "Biology",
      topics: { el: ["Φωτοσύνθεση"], en: ["Photosynthesis"] },
      questions: ["What does photosynthesis produce?"],
    });

    expect(result.items.criteria).toHaveLength(1);
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(body.text.format.name).toBe("lesson_rubric");
    expect(body.input[1].content).toContain("What does photosynthesis produce?");
  });

  it("requests resource suggestions with the strict suggestion schema", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      response({
        resources: [
          {
            title: "Photosynthesis video",
            description: "A short explainer",
            url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          },
        ],
      }),
    );

    const provider = new OpenAIContentProvider();
    const result = await provider.suggestResources({
      pages,
      sourceLocale: "en",
      title: "Biology",
      topics: { el: ["Φωτοσύνθεση"], en: ["Photosynthesis"] },
      limit: 8,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].url).toContain("youtube.com");
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(body.text.format.name).toBe("lesson_resource_suggestions");
    expect(body.input[1].content).toContain("Photosynthesis");
  });
});
