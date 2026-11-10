import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/server/db";
import { AppError } from "@/lib/errors";
import { createAttempt } from "@/server/repositories/attempts";
import { pickTranslation } from "./lesson-data";
import { getLessonQuestionnaireSummary } from "./class-summary";

export type SubmittedAnswer = { questionId: string; optionId: string };

export async function submitQuestionnaire(input: {
  lessonId: string;
  studentName: string;
  normalizedStudentName: string;
  locale: string;
  answers: SubmittedAnswer[];
  durationMs: number;
  idempotencyKey: string;
  retakeEnabled: boolean;
  passThreshold: number;
  db?: PrismaClient;
}) {
  const db = input.db ?? defaultPrisma;
  const lesson = await db.lesson.findUnique({
    where: { id: input.lessonId },
    include: {
      questions: { where: { mode: "QUESTIONNAIRE" }, orderBy: { position: "asc" }, include: { translations: true } },
    },
  });
  if (!lesson) throw new AppError("not_found", "Lesson not found", 404);
  if (lesson.status !== "READY") throw new AppError("not_ready", "Lesson is not ready", 409);

  if (!input.retakeEnabled) {
    const existing = await db.attempt.findFirst({
      where: {
        lessonId: input.lessonId,
        normalizedStudentName: input.normalizedStudentName,
        mode: "QUESTIONNAIRE",
        completedAt: { not: null },
      },
      orderBy: { completedAt: "desc" },
    });
    if (existing) {
      return { blocked: true as const, result: await buildQuestionnaireResult(existing.id, input.locale, db) };
    }
  }

  const answerMap = new Map(input.answers.map((answer) => [answer.questionId, answer.optionId]));
  const graded: Array<{ questionId: string; selectedOptionId: string; isCorrect: boolean }> = [];
  let score = 0;

  for (const question of lesson.questions) {
    const selected = answerMap.get(question.id);
    if (!selected) continue;
    const translation = pickTranslation(question.translations, input.locale, lesson.sourceLocale).translation;
    const options = Array.isArray(translation?.options) ? (translation.options as Array<{ id: string }>) : [];
    if (!options.some((option) => option.id === selected)) {
      throw new AppError("invalid_answer", `Invalid option for question ${question.id}`, 422);
    }
    const isCorrect = selected === question.correctOptionId;
    if (isCorrect) score += 1;
    graded.push({ questionId: question.id, selectedOptionId: selected, isCorrect });
  }

  const maxScore = lesson.questions.length;
  const percentage = maxScore === 0 ? 0 : Math.round((score / maxScore) * 100);
  const attempt = await createAttempt(
    {
      lessonId: input.lessonId,
      studentName: input.studentName,
      normalizedStudentName: input.normalizedStudentName,
      mode: "QUESTIONNAIRE",
      locale: input.locale,
      score,
      maxScore,
      percentage,
      passed: percentage >= input.passThreshold,
      durationMs: input.durationMs,
      idempotencyKey: `${input.idempotencyKey}`,
      answers: graded,
    },
    db,
  );

  await db.attemptDraft
    .deleteMany({
      where: { lessonId: input.lessonId, normalizedStudentName: input.normalizedStudentName },
    })
    .catch(() => undefined);

  return { blocked: false as const, result: await buildQuestionnaireResult(attempt.id, input.locale, db) };
}

export async function buildQuestionnaireResult(attemptId: string, locale: string, db: PrismaClient = defaultPrisma) {
  const attempt = await db.attempt.findUnique({
    where: { id: attemptId },
    include: {
      answers: true,
      lesson: {
        include: {
          questions: {
            where: { mode: "QUESTIONNAIRE" },
            orderBy: { position: "asc" },
            include: { translations: true },
          },
        },
      },
    },
  });
  if (!attempt) throw new AppError("not_found", "Attempt not found", 404);

  const feedback = attempt.lesson.questions.map((question) => {
    const answer = attempt.answers.find((item) => item.questionId === question.id);
    const translation = pickTranslation(question.translations, locale, attempt.lesson.sourceLocale).translation;
    return {
      questionId: question.id,
      selectedOptionId: answer?.selectedOptionId ?? null,
      correctOptionId: question.correctOptionId,
      isCorrect: answer?.isCorrect ?? false,
      explanation: translation?.explanation ?? "",
      sourcePage: question.sourcePage,
    };
  });

  return {
    attemptId: attempt.id,
    score: attempt.score,
    maxScore: attempt.maxScore,
    percentage: attempt.percentage,
    passed: attempt.passed,
    durationMs: attempt.durationMs,
    completedAt: (attempt.completedAt ?? attempt.createdAt).toISOString(),
    feedback,
    classSummary: await getLessonQuestionnaireSummary(attempt.lessonId, attempt.percentage, db),
  };
}
