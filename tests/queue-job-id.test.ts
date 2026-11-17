import { describe, expect, it } from "vitest";
import { jobIdFor, type PipelineJob } from "@/server/queue";

const base: PipelineJob = { lessonId: "lesson-1", stage: "generate", version: 3 };

describe("jobIdFor", () => {
  it("keeps the existing id when no run id is supplied", () => {
    expect(jobIdFor(base)).toBe("lesson-1-generate-3");
    expect(jobIdFor({ lessonId: "lesson-1", stage: "extract", version: 0 })).toBe("lesson-1-extract-0");
  });

  it("separates intentionally repeated runs", () => {
    const first = jobIdFor({ ...base, runId: "run-a" });
    const second = jobIdFor({ ...base, runId: "run-b" });
    expect(first).toBe("lesson-1-generate-3-run-a");
    expect(second).toBe("lesson-1-generate-3-run-b");
    expect(first).not.toBe(second);
  });

  it("distinguishes stages for the same lesson version", () => {
    const extract = jobIdFor({ ...base, stage: "extract" });
    const generate = jobIdFor({ ...base, stage: "generate" });
    expect(extract).toBe("lesson-1-extract-3");
    expect(generate).toBe("lesson-1-generate-3");
    expect(extract).not.toBe(generate);
  });
});
