import type { ProviderUsage } from "./provider";

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
};

export function estimateCost(usage: ProviderUsage[]): number {
  return usage.reduce((total, item) => {
    const price = MODEL_PRICING[item.model] ?? { input: 1, output: 4 };
    return total + (item.inputTokens / 1_000_000) * price.input + (item.outputTokens / 1_000_000) * price.output;
  }, 0);
}
