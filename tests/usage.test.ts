import { describe, expect, it } from "vitest";
import { estimateCost } from "@/server/generation/usage";

describe("estimateCost", () => {
  it("prices gpt-6-luna at its published token rates", () => {
    expect(
      estimateCost([{ model: "gpt-6-luna", inputTokens: 1_000_000, outputTokens: 1_000_000 }]),
    ).toBeCloseTo(0.6, 10);
  });

  it("prices a partial gpt-6-luna request", () => {
    expect(
      estimateCost([{ model: "gpt-6-luna", inputTokens: 500_000, outputTokens: 100_000 }]),
    ).toBeCloseTo(0.1, 10);
  });

  it("keeps the fallback rate for unknown models", () => {
    expect(
      estimateCost([{ model: "unknown-model", inputTokens: 1_000_000, outputTokens: 1_000_000 }]),
    ).toBeCloseTo(5, 10);
  });
});
