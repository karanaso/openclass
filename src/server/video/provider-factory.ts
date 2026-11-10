import { getEnv } from "@/lib/env";
import { DisabledVideoProvider } from "./disabled-provider";
import { HttpVideoProvider } from "./http-provider";
import { MockVideoProvider } from "./mock-provider";
import type { VideoProvider } from "./provider";

export function getVideoProvider(): VideoProvider {
  const env = getEnv();
  if (env.VIDEO_PROVIDER === "mock") return new MockVideoProvider();
  if (env.VIDEO_PROVIDER === "api") return new HttpVideoProvider();
  return new DisabledVideoProvider();
}
