import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  processor: null as null | ((job: unknown) => Promise<unknown>),
  handlers: {} as Record<string, (job: unknown, error: unknown) => Promise<void>>,
  processes: {
    extract: vi.fn(),
    generate: vi.fn(),
  },
  lessonUpdateMany: vi.fn(),
}));

vi.mock("bullmq", () => {
  class Worker {
    constructor(_name: string, processor: (job: unknown) => Promise<unknown>) {
      mocks.processor = processor;
    }
    on(event: string, handler: (job: unknown, error: unknown) => Promise<void>) {
      mocks.handlers[event] = handler;
      return this;
    }
    async close() {}
  }
  return { Worker };
});

vi.mock("@/lib/env", () => ({
  getEnv: () => ({ GENERATION_MAX_ATTEMPTS: 3 }),
}));

vi.mock("@/server/redis", () => ({ getRedis: () => ({}) }));
vi.mock("@/server/queue", () => ({ LESSON_QUEUE: "lesson-pipeline" }));
vi.mock("@/server/db", () => ({
  prisma: {
    lesson: { updateMany: mocks.lessonUpdateMany },
    $disconnect: vi.fn(),
  },
}));
vi.mock("@/worker/processors/extract", () => ({ processExtract: mocks.processes.extract }));
vi.mock("@/worker/processors/generate", () => ({ processGenerate: mocks.processes.generate }));

import { createPipelineWorker } from "@/worker/index";

function job(name: string, data: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    name,
    data: { lessonId: "lesson-1", stage: name, version: 0, ...data },
    attemptsMade: 0,
    opts: { attempts: 3 },
  };
}

beforeEach(() => {
  mocks.processor = null;
  mocks.handlers = {};
  for (const mock of Object.values(mocks.processes)) mock.mockReset().mockResolvedValue(undefined);
  mocks.lessonUpdateMany.mockReset().mockResolvedValue({ count: 1 });
});

describe("pipeline worker dispatch", () => {
  it("routes extract and generate to their processors", async () => {
    createPipelineWorker();
    expect(mocks.processor).not.toBeNull();

    await mocks.processor!(job("extract"));
    expect(mocks.processes.extract).toHaveBeenCalledWith(expect.objectContaining({ stage: "extract" }));

    await mocks.processor!(job("generate"));
    expect(mocks.processes.generate).toHaveBeenCalledWith(expect.objectContaining({ stage: "generate" }));
  });

  it("ignores a retired stage left in the queue", async () => {
    createPipelineWorker();
    await expect(mocks.processor!(job("story"))).resolves.toBeUndefined();
    expect(mocks.processes.extract).not.toHaveBeenCalled();
    expect(mocks.processes.generate).not.toHaveBeenCalled();
  });

  it("marks the lesson failed after the final failed attempt", async () => {
    createPipelineWorker();
    const failed = mocks.handlers.failed;
    expect(failed).toBeDefined();

    await failed({ ...job("generate"), attemptsMade: 3 }, new Error("generation failed"));
    expect(mocks.lessonUpdateMany).toHaveBeenCalledWith({
      where: { id: "lesson-1", status: { not: "CANCELLED" } },
      data: { status: "FAILED", failureReason: "generation failed" },
    });
  });
});
