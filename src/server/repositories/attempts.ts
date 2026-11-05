import { Prisma, type AttemptMode, type PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../db";

export type AttemptAnswerInput = {
  questionId: string;
  selectedOptionId: string;
  isCorrect: boolean;
};

export type CreateAttemptInput = {
  lessonId: string;
  studentName: string;
  normalizedStudentName: string;
  mode: AttemptMode;
  locale: string;
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  durationMs: number;
  reachedLevel?: number;
  idempotencyKey?: string;
  answers: AttemptAnswerInput[];
  startedAt?: Date;
};

export async function findCompletedAttempt(
  input: { lessonId: string; normalizedStudentName: string; mode: AttemptMode; idempotencyKey?: string },
  db: PrismaClient = defaultPrisma,
) {
  if (input.idempotencyKey) {
    return db.attempt.findFirst({
      where: { lessonId: input.lessonId, idempotencyKey: input.idempotencyKey, completedAt: { not: null } },
      include: { answers: true },
    });
  }
  return db.attempt.findFirst({
    where: {
      lessonId: input.lessonId,
      normalizedStudentName: input.normalizedStudentName,
      mode: input.mode,
      completedAt: { not: null },
    },
    orderBy: { completedAt: "desc" },
    include: { answers: true },
  });
}

export async function createAttempt(input: CreateAttemptInput, db: PrismaClient = defaultPrisma) {
  try {
    return await db.$transaction(async (tx) => {
      const attempt = await tx.attempt.create({
        data: {
          lessonId: input.lessonId,
          studentName: input.studentName,
          normalizedStudentName: input.normalizedStudentName,
          mode: input.mode,
          locale: input.locale,
          score: input.score,
          maxScore: input.maxScore,
          percentage: input.percentage,
          passed: input.passed,
          durationMs: input.durationMs,
          reachedLevel: input.reachedLevel,
          idempotencyKey: input.idempotencyKey,
          startedAt: input.startedAt ?? new Date(),
          completedAt: new Date(),
          lastActivityAt: new Date(),
          answers: {
            create: input.answers.map((answer) => ({
              questionId: answer.questionId,
              selectedOptionId: answer.selectedOptionId,
              isCorrect: answer.isCorrect,
            })),
          },
        },
        include: { answers: true },
      });
      return attempt;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && input.idempotencyKey) {
      const existing = await db.attempt.findFirst({
        where: { lessonId: input.lessonId, idempotencyKey: input.idempotencyKey },
        include: { answers: true },
      });
      if (existing) return existing;
    }
    throw error;
  }
}
