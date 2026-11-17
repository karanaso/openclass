import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LocalStorage } from "@/server/storage";
import { cleanupLessonMedia, listStoredLessonIds, retiredMediaPrefixes } from "@/scripts/cleanup-video-artifacts";

let root: string;
let storage: LocalStorage;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "lessonlab-cleanup-"));
  storage = new LocalStorage(root);
  await storage.put("lessons/lesson-a/source.pdf", "%PDF-a");
  await storage.put("lessons/lesson-a/video/el.mp4", "video");
  await storage.put("lessons/lesson-a/audio/el/page-1.mp3", "audio");
  await storage.put("lessons/lesson-a/visual/scene.png", "scene");
  await storage.put("lessons/lesson-a/pages/page-1.png", "page");
  await storage.put("lessons/lesson-b/source.pdf", "%PDF-b");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("cleanupLessonMedia", () => {
  it("discovers stored lesson directories, including orphans", async () => {
    expect((await listStoredLessonIds(root)).sort()).toEqual(["lesson-a", "lesson-b"]);
    expect(await listStoredLessonIds(path.join(root, "missing"))).toEqual([]);
  });

  it("reports every retired prefix without deleting during a dry run", async () => {
    const log = vi.fn();
    const summary = await cleanupLessonMedia({
      lessonIds: ["lesson-a", "lesson-b"],
      storage,
      apply: false,
      log,
    });

    expect(summary).toMatchObject({ scanned: 2, present: 4, deleted: 0, failures: [] });
    expect(log).toHaveBeenCalledWith("would delete lessons/lesson-a/video");
    expect(log).toHaveBeenCalledWith("missing lessons/lesson-b/video");
    for (const prefix of retiredMediaPrefixes("lesson-a")) {
      expect(await storage.exists(prefix)).toBe(true);
    }
  });

  it("deletes retired prefixes and keeps the source PDF", async () => {
    const summary = await cleanupLessonMedia({ lessonIds: ["lesson-a", "lesson-b"], storage, apply: true });

    expect(summary).toMatchObject({ scanned: 2, present: 4, deleted: 4, failures: [] });
    for (const prefix of retiredMediaPrefixes("lesson-a")) {
      expect(await storage.exists(prefix)).toBe(false);
    }
    expect(await storage.exists("lessons/lesson-a/source.pdf")).toBe(true);
    expect(await storage.exists("lessons/lesson-b/source.pdf")).toBe(true);
    expect(await storage.exists("lessons/lesson-b/video")).toBe(false);
  });

  it("continues after a per-prefix failure", async () => {
    const failing = {
      exists: storage.exists.bind(storage),
      deletePrefix: vi.fn(async (prefix: string) => {
        if (prefix.endsWith("/audio")) throw new Error("permission denied");
        await storage.deletePrefix(prefix);
      }),
    };

    const summary = await cleanupLessonMedia({
      lessonIds: ["lesson-a", "lesson-b"],
      storage: failing,
      apply: true,
    });

    expect(summary.failures).toHaveLength(1);
    expect(summary.failures[0]).toMatchObject({ lessonId: "lesson-a", prefix: "lessons/lesson-a/audio" });
    expect(summary.deleted).toBe(3);
    expect(await storage.exists("lessons/lesson-a/video")).toBe(false);
    expect(await storage.exists("lessons/lesson-a/pages")).toBe(false);
  });
});
