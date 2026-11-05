import { generateLessonContent } from "@/server/generation/orchestrator";
import type { PipelineJob } from "@/server/queue";

export async function processGenerate(data: PipelineJob): Promise<void> {
  await generateLessonContent(data.lessonId, { continueToMedia: true });
}
