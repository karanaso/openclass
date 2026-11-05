import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalStorage, randomStorageKey, safeStorageKey } from "@/server/storage";

let root: string;
let storage: LocalStorage;

beforeAll(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "lessonlab-storage-"));
  storage = new LocalStorage(root);
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("storage keys", () => {
  it("rejects traversal and absolute keys", () => {
    expect(() => safeStorageKey("../secret")).toThrow(/traversal/i);
    expect(() => safeStorageKey("a/../../b")).toThrow(/traversal/i);
    expect(() => safeStorageKey("/etc/passwd")).toThrow(/traversal/i);
    expect(() => safeStorageKey("")).toThrow();
  });

  it("creates collision-safe random keys", () => {
    const a = randomStorageKey("lessons/abc");
    const b = randomStorageKey("lessons/abc");
    expect(a).not.toBe(b);
    expect(a.startsWith("lessons/abc/")).toBe(true);
    expect(a.endsWith(".pdf")).toBe(true);
  });
});

describe("local storage", () => {
  it("puts, stats, streams, and deletes a prefix", async () => {
    const key = randomStorageKey("lessons/test");
    await storage.put(key, new Uint8Array([1, 2, 3, 4]));
    expect(await storage.exists(key)).toBe(true);
    expect((await storage.stat(key)).size).toBe(4);

    const chunks: Buffer[] = [];
    for await (const chunk of storage.getStream(key)) {
      chunks.push(Buffer.from(chunk));
    }
    expect(Buffer.concat(chunks)).toEqual(Buffer.from([1, 2, 3, 4]));

    await storage.deletePrefix("lessons/test");
    expect(await storage.exists(key)).toBe(false);
  });
});
