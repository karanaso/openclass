import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/server/db";
import { listCompletedQuestionnairePercentages } from "@/server/repositories/attempts";

export const MIN_CLASS_ATTEMPTS = 3;

export const CLASS_SCORE_BANDS = ["0-19", "20-39", "40-59", "60-79", "80-100"] as const;
export type ClassScoreBand = (typeof CLASS_SCORE_BANDS)[number];

export type ClassSummary = {
  attempts: number;
  average: number;
  highest: number;
  lowest: number;
  distribution: Array<{ band: ClassScoreBand; count: number }>;
  currentBand: ClassScoreBand;
};

function bandForPercentage(percentage: number): ClassScoreBand {
  const index = Math.min(CLASS_SCORE_BANDS.length - 1, Math.max(0, Math.floor(percentage / 20)));
  return CLASS_SCORE_BANDS[index];
}

export async function getLessonQuestionnaireSummary(
  lessonId: string,
  currentPercentage: number,
  db: PrismaClient = defaultPrisma,
): Promise<ClassSummary | null> {
  const percentages = await listCompletedQuestionnairePercentages(lessonId, db);
  if (percentages.length < MIN_CLASS_ATTEMPTS) return null;

  const distribution = CLASS_SCORE_BANDS.map((band) => ({ band, count: 0 }));
  for (const percentage of percentages) {
    const band = bandForPercentage(percentage);
    const entry = distribution.find((item) => item.band === band);
    if (entry) entry.count += 1;
  }

  return {
    attempts: percentages.length,
    average: Math.round(percentages.reduce((sum, value) => sum + value, 0) / percentages.length),
    highest: Math.max(...percentages),
    lowest: Math.min(...percentages),
    distribution,
    currentBand: bandForPercentage(currentPercentage),
  };
}
