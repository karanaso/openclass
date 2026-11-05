import { AppError } from "@/lib/errors";
import type { PipelineJob } from "@/server/queue";

export async function processRender(_data: PipelineJob): Promise<void> {
  throw new AppError("render_unavailable", "Video rendering is not available yet", 500);
}
