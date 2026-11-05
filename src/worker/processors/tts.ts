import { AppError } from "@/lib/errors";
import type { PipelineJob } from "@/server/queue";

export async function processTts(_data: PipelineJob): Promise<void> {
  throw new AppError("tts_unavailable", "Speech synthesis is not available yet", 500);
}
