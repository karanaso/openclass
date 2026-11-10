import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetEnvCache } from "@/lib/env";
import { LocalStorage } from "@/server/storage";
import { ingestVideoOutput } from "@/server/video/ingest";
import { MockVideoProvider } from "@/server/video/mock-provider";
import type {
  VideoProvider,
  VideoProviderDownload,
  VideoProviderJob,
  VideoSubmitInput,
} from "@/server/video/provider";

let root: string;
let storage: LocalStorage;

const baseEnv = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  AUTH_SECRET: "a".repeat(40),
  TEACHER_PASSWORD: "secret",
  AI_PROVIDER: "mock",
  TTS_PROVIDER: "mock",
  MAX_VIDEO_SECONDS: "900",
  VIDEO_MAX_OUTPUT_BYTES: "536870912",
};

class VideoOnlyProvider implements VideoProvider {
  readonly name = "fake";
  constructor(private readonly empty = false) {}

  async submit(_input: VideoSubmitInput) {
    return { id: "fake-job", status: "queued" };
  }

  async getJob(id: string): Promise<VideoProviderJob> {
    return { id, status: "completed" };
  }

  async download(url: string): Promise<VideoProviderDownload> {
    if (url === "fake://video" && !this.empty) {
      const fixture = await new MockVideoProvider().download("mock://video");
      return { body: fixture.body, contentType: "video/mp4" };
    }
    return { body: new Uint8Array(), contentType: null };
  }
}

beforeEach(async () => {
  for (const [key, value] of Object.entries(baseEnv)) process.env[key] = value;
  root = await mkdtemp(path.join(os.tmpdir(), "lessonlab-ingest-"));
  process.env.STORAGE_ROOT = root;
  resetEnvCache();
  storage = new LocalStorage(root);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  for (const key of Object.keys(baseEnv)) delete process.env[key];
  delete process.env.STORAGE_ROOT;
  delete process.env.VIDEO_MAX_OUTPUT_BYTES;
  resetEnvCache();
});

describe("provider output ingestion", () => {
  it("stores the video, captions, and poster and measures duration", async () => {
    const provider = new MockVideoProvider();
    const submitted = await provider.submit({
      lessonId: "lesson-1",
      locale: "el",
      contentVersion: 0,
      idempotencyKey: "ingest-test",
      title: "Energy",
      story: { title: "Story", logline: "Logline", scenes: [] },
    });
    const job = await provider.getJob(submitted.id);
    const result = await ingestVideoOutput({
      lessonId: "lesson-1",
      locale: "el",
      job,
      provider,
      storage,
    });

    expect(result.videoKey).toBe("lessons/lesson-1/video/el.mp4");
    expect(result.captionsKey).toBe("lessons/lesson-1/video/el.vtt");
    expect(result.posterKey).toBe("lessons/lesson-1/video/el.jpg");
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(await storage.exists(result.videoKey)).toBe(true);
    expect(await storage.exists(result.captionsKey!)).toBe(true);
    expect(await storage.exists(result.posterKey!)).toBe(true);
  });

  it("keeps playback possible when captions and poster are absent", async () => {
    const result = await ingestVideoOutput({
      lessonId: "lesson-2",
      locale: "en",
      job: {
        id: "job-2",
        status: "completed",
        durationSeconds: 1,
        outputs: { videoUrl: "fake://video" },
      },
      provider: new VideoOnlyProvider(),
      storage,
    });

    expect(result.captionsKey).toBeNull();
    expect(result.posterKey).toBeNull();
    expect(await storage.exists(result.videoKey)).toBe(true);
  });

  it("rejects an empty video body", async () => {
    await expect(
      ingestVideoOutput({
        lessonId: "lesson-3",
        locale: "el",
        job: { id: "job-3", status: "completed", outputs: { videoUrl: "fake://video" } },
        provider: new VideoOnlyProvider(true),
        storage,
      }),
    ).rejects.toMatchObject({ code: "invalid_video_output" });
  });

  it("rejects an oversized video body", async () => {
    process.env.VIDEO_MAX_OUTPUT_BYTES = "100";
    resetEnvCache();
    await expect(
      ingestVideoOutput({
        lessonId: "lesson-5",
        locale: "el",
        job: { id: "job-5", status: "completed", outputs: { videoUrl: "fake://video" } },
        provider: new VideoOnlyProvider(),
        storage,
      }),
    ).rejects.toMatchObject({ code: "invalid_video_output" });
  });

  it("rejects output whose provider duration exceeds the configured limit", async () => {
    await expect(
      ingestVideoOutput({
        lessonId: "lesson-4",
        locale: "el",
        job: {
          id: "job-4",
          status: "completed",
          durationSeconds: 901,
          outputs: { videoUrl: "fake://video" },
        },
        provider: new VideoOnlyProvider(),
        storage,
      }),
    ).rejects.toMatchObject({ code: "video_too_long" });
  });
});
