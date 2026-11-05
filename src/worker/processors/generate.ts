import { AppError } from "@/lib/errors";
import type { PipelineJob } from "@/server/queue";

export async function processGenerate(_data: PipelineJob): Promise<void> {
  throw new AppError("generation_unavailable", "Content generation is not available yet", 500);
}
