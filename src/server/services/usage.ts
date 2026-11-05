import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/server/db";

export type UsageSummary = {
  inputTokens: number;
  outputTokens: number;
  tokens: number;
  estimatedCostUsd: number;
};

export async function getLessonUsage(lessonId: string, db: PrismaClient = defaultPrisma): Promise<UsageSummary> {
  const jobs = await db.generationJob.findMany({
    where: { lessonId },
    select: { inputTokens: true, outputTokens: true, estimatedCostUsd: true },
  });
  const inputTokens = jobs.reduce((sum, job) => sum + job.inputTokens, 0);
  const outputTokens = jobs.reduce((sum, job) => sum + job.outputTokens, 0);
  return {
    inputTokens,
    outputTokens,
    tokens: inputTokens + outputTokens,
    estimatedCostUsd: jobs.reduce((sum, job) => sum + job.estimatedCostUsd, 0),
  };
}

export async function getClassUsage(classId: string, db: PrismaClient = defaultPrisma) {
  const lessons = await db.lesson.findMany({
    where: { classId },
    select: {
      id: true,
      title: true,
      jobs: { select: { inputTokens: true, outputTokens: true, estimatedCostUsd: true } },
    },
  });

  const perLesson = lessons.map((lesson) => {
    const inputTokens = lesson.jobs.reduce((sum, job) => sum + job.inputTokens, 0);
    const outputTokens = lesson.jobs.reduce((sum, job) => sum + job.outputTokens, 0);
    return {
      lessonId: lesson.id,
      title: lesson.title,
      inputTokens,
      outputTokens,
      tokens: inputTokens + outputTokens,
      estimatedCostUsd: lesson.jobs.reduce((sum, job) => sum + job.estimatedCostUsd, 0),
    };
  });

  return {
    inputTokens: perLesson.reduce((sum, lesson) => sum + lesson.inputTokens, 0),
    outputTokens: perLesson.reduce((sum, lesson) => sum + lesson.outputTokens, 0),
    tokens: perLesson.reduce((sum, lesson) => sum + lesson.tokens, 0),
    estimatedCostUsd: perLesson.reduce((sum, lesson) => sum + lesson.estimatedCostUsd, 0),
    lessons: perLesson,
  };
}
