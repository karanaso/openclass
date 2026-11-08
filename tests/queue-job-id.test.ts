import { describe, expect, it } from "vitest";
import { jobIdFor, type PipelineJob } from "@/server/queue";

const base: PipelineJob = { lessonId: "lesson-1", stage: "tts", version: 3, locale: "el" };

describe("jobIdFor", () => {
  it("keeps the existing id when no run id is supplied", () => {
    expect(jobIdFor(base)).toBe("lesson-1-tts-3-el");
    expect(jobIdFor({ lessonId: "lesson-1", stage: "extract", version: 0 })).toBe("lesson-1-extract-0");
  });

  it("separates intentionally repeated runs", () => {
    const first = jobIdFor({ ...base, runId: "run-a" });
    const second = jobIdFor({ ...base, runId: "run-b" });
    expect(first).toBe("lesson-1-tts-3-el-run-a");
    expect(second).toBe("lesson-1-tts-3-el-run-b");
    expect(first).not.toBe(second);
  });
});
