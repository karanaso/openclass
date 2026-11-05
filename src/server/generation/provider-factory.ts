import { getEnv } from "@/lib/env";
import { MockContentProvider } from "./mock-provider";
import { OpenAIContentProvider } from "./openai-provider";
import type { ContentProvider } from "./provider";

export function getContentProvider(): ContentProvider {
  const env = getEnv();
  return env.AI_PROVIDER === "mock" ? new MockContentProvider() : new OpenAIContentProvider();
}
