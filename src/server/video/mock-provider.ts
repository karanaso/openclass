import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  VideoProvider,
  VideoProviderDownload,
  VideoProviderJob,
  VideoSubmitInput,
} from "./provider";

const FIXTURE_DIRECTORY = path.join(process.cwd(), "src", "server", "video", "fixtures");
const FIXTURES = {
  "mock://video": path.join(FIXTURE_DIRECTORY, "mock-video.mp4"),
  "mock://captions": path.join(FIXTURE_DIRECTORY, "mock-captions.vtt"),
  "mock://poster": path.join(FIXTURE_DIRECTORY, "mock-poster.jpg"),
} as const;

export class MockVideoProvider implements VideoProvider {
  readonly name = "mock";

  async submit(_input: VideoSubmitInput): Promise<{ id: string; status: string }> {
    return { id: `mock-${randomUUID()}`, status: "queued" };
  }

  async getJob(id: string): Promise<VideoProviderJob> {
    return {
      id,
      status: "completed",
      progress: 100,
      durationSeconds: 1,
      outputs: {
        videoUrl: "mock://video",
        captionsUrl: "mock://captions",
        posterUrl: "mock://poster",
      },
    };
  }

  async download(url: string): Promise<VideoProviderDownload> {
    const fixture = FIXTURES[url as keyof typeof FIXTURES];
    if (!fixture) {
      return { body: new Uint8Array(), contentType: null };
    }
    return {
      body: new Uint8Array(await readFile(fixture)),
      contentType: url === "mock://video" ? "video/mp4" : url === "mock://captions" ? "text/vtt" : "image/jpeg",
    };
  }
}
