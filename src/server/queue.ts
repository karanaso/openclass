import { Queue } from "bullmq";
import { getEnv } from "@/lib/env";
import { getRedis } from "./redis";

export const LESSON_QUEUE = "lesson-pipeline";

export type PipelineStage =
  | "extract"
  | "generate"
  | "narration"
  | "story"
  | "tts"
  | "visual"
  | "video-submit"
  | "video-poll"
  | "render";

export type PipelineJob = {
  lessonId: string;
  stage: PipelineStage;
  version: number;
  locale?: "el" | "en";
  runId?: string;
};

let queue: Queue<PipelineJob> | null = null;

export function getLessonQueue(): Queue<PipelineJob> {
  if (!queue) {
    queue = new Queue<PipelineJob>(LESSON_QUEUE, {
      connection: getRedis(),
      defaultJobOptions: {
        removeOnComplete: 200,
        removeOnFail: 1000,
      },
    });
  }
  return queue;
}

export function jobIdFor(input: PipelineJob): string {
  return `${input.lessonId}-${input.stage}-${input.version}${input.locale ? `-${input.locale}` : ""}${
    input.runId ? `-${input.runId}` : ""
  }`;
}

export async function enqueueStage(input: PipelineJob, delayMs = 0): Promise<void> {
  const env = getEnv();
  await getLessonQueue().add(input.stage, input, {
    jobId: jobIdFor(input),
    attempts: env.GENERATION_MAX_ATTEMPTS,
    backoff: { type: "exponential", delay: 2000 },
    delay: delayMs,
  });
}

export async function removeJobsForLesson(lessonId: string, version: number): Promise<void> {
  const queueInstance = getLessonQueue();
  const jobs = await queueInstance.getJobs(["waiting", "delayed", "paused", "prioritized", "active"], 0, -1, false);
  await Promise.all(
    jobs
      .filter((job) => job?.data?.lessonId === lessonId && job.data.version === version)
      .map(async (job) => {
        try {
          if (job) await job.remove();
        } catch {
          // An active job cannot be removed; its processor will observe the cancelled status.
        }
      }),
  );
}

export async function closeLessonQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = null;
  }
}
