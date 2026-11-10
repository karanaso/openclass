import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import { resetEnvCache } from "@/lib/env";
import { HttpVideoProvider } from "@/server/video/http-provider";
import { MockVideoProvider } from "@/server/video/mock-provider";
import type { VideoSubmitInput } from "@/server/video/provider";

const baseEnv = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  AUTH_SECRET: "a".repeat(40),
  TEACHER_PASSWORD: "secret",
  AI_PROVIDER: "mock",
  TTS_PROVIDER: "mock",
};

const input: VideoSubmitInput = {
  lessonId: "lesson-1",
  locale: "el",
  contentVersion: 3,
  idempotencyKey: "lesson-1:el:3:run-1",
  title: "Energy",
  story: {
    title: "The Energy Journey",
    logline: "A short story.",
    scenes: [
      {
        sceneKey: "scene-1",
        sourcePages: [1],
        narration: "Η φωτοσύνθεση ξεκινά το ταξίδι.",
      },
    ],
  },
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  for (const [key, value] of Object.entries(baseEnv)) process.env[key] = value;
  resetEnvCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of Object.keys(baseEnv)) delete process.env[key];
  delete process.env.VIDEO_AI_API_KEY;
  delete process.env.VIDEO_AI_MODEL;
  resetEnvCache();
});

describe("HttpVideoProvider", () => {
  it("submits the story with bearer auth and returns the provider job id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "job-1", status: "queued" }, 202));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new HttpVideoProvider({
      baseUrl: "https://video.example.test/api",
      apiKey: "secret-key",
      model: "video-model",
      requestTimeoutMs: 1_000,
    });

    const result = await provider.submit(input);

    expect(result).toEqual({ id: "job-1", status: "queued" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://video.example.test/api/videos");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer secret-key");
    const body = JSON.parse(init.body as string);
    expect(body.idempotencyKey).toBe("lesson-1:el:3:run-1");
    expect(body.model).toBe("video-model");
    expect(body.story.scenes[0].narration).toContain("φωτοσύνθεση");
  });

  it("resolves an existing job on a 409 idempotency response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ id: "job-existing", status: "processing" }, 409)));
    const provider = new HttpVideoProvider({ baseUrl: "https://video.example.test", apiKey: "key" });

    await expect(provider.submit(input)).resolves.toEqual({ id: "job-existing", status: "processing" });
  });

  it("reports provider rejections and non-JSON responses", async () => {
    const provider = new HttpVideoProvider({ baseUrl: "https://video.example.test" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 })));
    await expect(provider.submit(input)).rejects.toMatchObject({ code: "video_provider_rejected" });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>oops</html>", { status: 200 })));
    await expect(provider.getJob("job-1")).rejects.toMatchObject({ code: "video_provider_invalid_response" });
  });

  it("maps provider status and output URLs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          id: "job-1",
          status: "completed",
          progress: 100,
          durationSeconds: 84,
          outputs: {
            videoUrl: "files/video.mp4",
            captionsUrl: "files/captions.vtt",
            posterUrl: "files/poster.jpg",
          },
        }),
      ),
    );
    const provider = new HttpVideoProvider({ baseUrl: "https://video.example.test/api" });
    const job = await provider.getJob("job-1");

    expect(job).toMatchObject({
      status: "completed",
      progress: 100,
      durationSeconds: 84,
      outputs: {
        videoUrl: "files/video.mp4",
        captionsUrl: "files/captions.vtt",
        posterUrl: "files/poster.jpg",
      },
    });
  });

  it("turns an aborted request into a timeout error", async () => {
    const timeout = new DOMException("The operation timed out.", "TimeoutError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeout));
    const provider = new HttpVideoProvider({ baseUrl: "https://video.example.test", requestTimeoutMs: 1 });

    await expect(provider.submit(input)).rejects.toMatchObject({
      code: "video_provider_timeout",
    } satisfies Partial<AppError>);
  });
});

describe("MockVideoProvider", () => {
  it("completes with local fixtures and no network access", async () => {
    const provider = new MockVideoProvider();
    const submitted = await provider.submit(input);
    const job = await provider.getJob(submitted.id);

    expect(job.status).toBe("completed");
    expect(job.outputs?.videoUrl).toBe("mock://video");
    const video = await provider.download("mock://video");
    const captions = await provider.download("mock://captions");
    const poster = await provider.download("mock://poster");
    expect(video.body.byteLength).toBeGreaterThan(0);
    expect(video.contentType).toBe("video/mp4");
    expect(captions.contentType).toBe("text/vtt");
    expect(poster.contentType).toBe("image/jpeg");
  });
});
