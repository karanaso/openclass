import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lessonFindUnique: vi.fn(),
  videoUpsert: vi.fn(),
  videoUpdate: vi.fn(),
  enqueueStage: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  prisma: {
    lesson: { findUnique: mocks.lessonFindUnique },
    videoAsset: { upsert: mocks.videoUpsert, update: mocks.videoUpdate },
  },
}));

vi.mock("@/server/queue", () => ({
  enqueueStage: mocks.enqueueStage,
}));

vi.mock("@/server/auth/guard", () => ({
  requireTeacher: vi.fn().mockResolvedValue(undefined),
  assertSameOrigin: vi.fn(),
}));

import { POST } from "@/app/api/admin/lessons/[lessonId]/video/route";

beforeEach(() => {
  mocks.lessonFindUnique.mockReset();
  mocks.videoUpsert.mockReset();
  mocks.videoUpdate.mockReset();
  mocks.enqueueStage.mockReset();
  mocks.lessonFindUnique.mockResolvedValue({
    id: "lesson-1",
    status: "READY",
    jobVersion: 0,
    videos: [],
    _count: { pages: 2 },
  });
  mocks.videoUpsert.mockResolvedValue({});
  mocks.videoUpdate.mockResolvedValue({});
});

describe("admin video route queue failure", () => {
  it("marks the variant failed when the queue rejects the job", async () => {
    mocks.enqueueStage.mockRejectedValue(new Error("redis down"));
    const response = await POST(
      new Request("http://localhost:3000/api/admin/lessons/lesson-1/video", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale: "el" }),
      }),
      { params: Promise.resolve({ lessonId: "lesson-1" }) },
    );

    expect(response.status).toBe(500);
    expect(mocks.videoUpdate).toHaveBeenCalledWith({
      where: { lessonId_locale: { lessonId: "lesson-1", locale: "el" } },
      data: { status: "FAILED", error: "redis down" },
    });
  });
});
