import { beforeEach, describe, expect, it, vi } from "vitest";

const setLessonStatus = vi.fn();
const enqueueStage = vi.fn();
const discoverResourceCandidates = vi.fn();
const createSuggestedResources = vi.fn();
const warn = vi.fn();

const lesson = {
  id: "lesson-1",
  storageKey: "lessons/lesson-1/original.pdf",
  sourceLocale: "en",
  status: "QUEUED",
};

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(async () => Buffer.from("pdf-bytes")),
}));

vi.mock("@/lib/logger", () => ({ logger: { warn } }));

vi.mock("@/server/storage", () => ({
  getStorage: () => ({ getAbsolutePath: () => "/tmp/lesson-1.pdf" }),
}));

vi.mock("@/server/pdf/extract", () => ({
  extractPdfPages: vi.fn(async () => [
    { pageNumber: 1, text: "Photosynthesis converts light energy into chemical energy." },
  ]),
}));

vi.mock("@/server/pdf/resources", () => ({ discoverResourceCandidates }));

vi.mock("@/server/services/resources", () => ({ createSuggestedResources }));

vi.mock("@/server/repositories/lesson-status", () => ({ setLessonStatus }));

vi.mock("@/server/queue", () => ({ enqueueStage }));

vi.mock("@/server/db", () => {
  const prisma = {
    lesson: {
      findUnique: vi.fn(async () => lesson),
      update: vi.fn(),
    },
    lessonPage: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
  };
  return { prisma };
});

describe("extract processor resource discovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("still advances to generation when discovery throws", async () => {
    discoverResourceCandidates.mockRejectedValueOnce(new Error("decoder exploded"));

    const { processExtract } = await import("@/worker/processors/extract");
    await expect(
      processExtract({ lessonId: "lesson-1", stage: "extract", version: 3 }),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ lessonId: "lesson-1" }),
      "resource discovery failed",
    );
    expect(setLessonStatus).toHaveBeenCalledWith("lesson-1", "GENERATING");
    expect(enqueueStage).toHaveBeenCalledWith({
      lessonId: "lesson-1",
      stage: "generate",
      version: 3,
    });
  });

  it("stores discovered suggestions before generating", async () => {
    discoverResourceCandidates.mockResolvedValueOnce([
      { url: "https://example.com/resource", title: "Resource", source: "TEXT", sourcePage: 1 },
    ]);

    const { processExtract } = await import("@/worker/processors/extract");
    await processExtract({ lessonId: "lesson-1", stage: "extract", version: 4 });

    expect(createSuggestedResources).toHaveBeenCalledWith("lesson-1", [
      { url: "https://example.com/resource", title: "Resource", source: "TEXT", sourcePage: 1 },
    ]);
    expect(enqueueStage).toHaveBeenCalledWith({
      lessonId: "lesson-1",
      stage: "generate",
      version: 4,
    });
  });
});
