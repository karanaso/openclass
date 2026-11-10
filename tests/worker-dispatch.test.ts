import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  processor: null as null | ((job: unknown) => Promise<unknown>),
  handlers: {} as Record<string, (job: unknown, error: unknown) => Promise<void>>,
  processes: {
    extract: vi.fn(),
    generate: vi.fn(),
    narration: vi.fn(),
    story: vi.fn(),
    tts: vi.fn(),
    visual: vi.fn(),
    submit: vi.fn(),
    poll: vi.fn(),
    render: vi.fn(),
  },
  markMediaFailure: vi.fn(),
  markStoryFailure: vi.fn(),
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
vi.mock("@/server/video/resume", () => ({ resumeVideoJobs: vi.fn() }));
vi.mock("@/worker/failures", () => ({
  markMediaFailure: mocks.markMediaFailure,
  markStoryFailure: mocks.markStoryFailure,
}));
vi.mock("@/worker/processors/extract", () => ({ processExtract: mocks.processes.extract }));
vi.mock("@/worker/processors/generate", () => ({ processGenerate: mocks.processes.generate }));
vi.mock("@/worker/processors/narration", () => ({ processNarration: mocks.processes.narration }));
vi.mock("@/worker/processors/story", () => ({ processStory: mocks.processes.story }));
vi.mock("@/worker/processors/tts", () => ({ processTts: mocks.processes.tts }));
vi.mock("@/worker/processors/visual", () => ({ processVisual: mocks.processes.visual }));
vi.mock("@/worker/processors/video", () => ({
  processVideoSubmit: mocks.processes.submit,
  processVideoPoll: mocks.processes.poll,
}));
vi.mock("@/worker/processors/render", () => ({ processRender: mocks.processes.render }));

import { createPipelineWorker } from "@/worker/index";

function job(name: string, data: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    name,
    data: { lessonId: "lesson-1", stage: name, version: 0, locale: "el", ...data },
    attemptsMade: 0,
    opts: { attempts: 3 },
  };
}

beforeEach(() => {
  mocks.processor = null;
  mocks.handlers = {};
  for (const mock of Object.values(mocks.processes)) mock.mockReset().mockResolvedValue(undefined);
  mocks.markMediaFailure.mockReset().mockResolvedValue(undefined);
  mocks.markStoryFailure.mockReset().mockResolvedValue(undefined);
  mocks.lessonUpdateMany.mockReset().mockResolvedValue({ count: 1 });
});

describe("pipeline worker dispatch", () => {
  it("routes every stage to its processor", async () => {
    createPipelineWorker();
    expect(mocks.processor).not.toBeNull();

    const cases: Array<[string, (typeof mocks.processes)[keyof typeof mocks.processes]]> = [
      ["extract", mocks.processes.extract],
      ["generate", mocks.processes.generate],
      ["narration", mocks.processes.narration],
      ["story", mocks.processes.story],
      ["tts", mocks.processes.tts],
      ["visual", mocks.processes.visual],
      ["video-submit", mocks.processes.submit],
      ["video-poll", mocks.processes.poll],
      ["render", mocks.processes.render],
    ];
    for (const [stage, mock] of cases) {
      await mocks.processor!(job(stage));
      expect(mock).toHaveBeenCalledWith(expect.objectContaining({ stage }));
    }
  });

  it("isolates story and provider failures to the media variant", async () => {
    createPipelineWorker();
    const failed = mocks.handlers.failed;
    expect(failed).toBeDefined();

    const storyJob = {
      ...job("story"),
      attemptsMade: 3,
    };
    await failed(storyJob, new Error("story failed"));
    expect(mocks.markMediaFailure).toHaveBeenCalledWith(storyJob.data, expect.any(Error));
    expect(mocks.markStoryFailure).toHaveBeenCalledWith(storyJob.data, expect.any(Error));
    expect(mocks.lessonUpdateMany).not.toHaveBeenCalled();

    mocks.markMediaFailure.mockClear();
    mocks.markStoryFailure.mockClear();
    await failed({ ...job("video-poll"), attemptsMade: 3 }, new Error("provider failed"));
    expect(mocks.markMediaFailure).toHaveBeenCalledTimes(1);
    expect(mocks.markStoryFailure).not.toHaveBeenCalled();
    expect(mocks.lessonUpdateMany).not.toHaveBeenCalled();
  });
});
