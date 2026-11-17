import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalStorage, randomStorageKey } from "@/server/storage";
import { serveStoredMedia } from "@/server/media/serve-media";

let root: string;
let storage: LocalStorage;
let key: string;

beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "lessonlab-serve-media-"));
  storage = new LocalStorage(root);
  key = randomStorageKey("lessons/test");
  await storage.put(key, new Uint8Array([1, 2, 3, 4]));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("serveStoredMedia", () => {
  it("merges extra headers into a full response", async () => {
    const response = await serveStoredMedia(new Request("http://localhost/media"), storage, {
      key,
      contentType: "application/pdf",
      headers: { "content-disposition": 'inline; filename="lesson.pdf"' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe('inline; filename="lesson.pdf"');
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it("merges extra headers into a range response", async () => {
    const response = await serveStoredMedia(
      new Request("http://localhost/media", { headers: { range: "bytes=1-2" } }),
      storage,
      {
        key,
        contentType: "application/pdf",
        headers: { "content-disposition": 'inline; filename="lesson.pdf"' },
      },
    );

    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 1-2/4");
    expect(response.headers.get("content-length")).toBe("2");
    expect(response.headers.get("content-disposition")).toBe('inline; filename="lesson.pdf"');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([2, 3]));
  });
});
