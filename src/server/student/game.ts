import type { Prisma, PrismaClient } from "@prisma/client";
import { AppError } from "@/lib/errors";
import { prisma as defaultPrisma } from "@/server/db";
import { pickTranslation, toStudentQuestion, type StudentQuestion } from "./lesson-data";

const GAME_TTL_MS = 4 * 60 * 60 * 1000;

export type Lifelines = { fiftyFifty: boolean; askAudience: boolean };

type GameAttempt = {
  id: string;
  lessonId: string;
  normalizedStudentName: string;
  locale: string;
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  reachedLevel: number | null;
  gameStatus: "ACTIVE" | "COMPLETED" | "ENDED" | null;
  questionOrder: Prisma.JsonValue;
  currentIndex: number;
  lifelines: Prisma.JsonValue;
  startedAt: Date;
  lastActivityAt: Date;
  completedAt: Date | null;
};

function orderOf(attempt: GameAttempt): string[] {
  return Array.isArray(attempt.questionOrder) ? (attempt.questionOrder as string[]) : [];
}

function lifelinesOf(attempt: GameAttempt): Lifelines {
  const value = attempt.lifelines as Partial<Lifelines> | null;
  return { fiftyFifty: Boolean(value?.fiftyFifty), askAudience: Boolean(value?.askAudience) };
}

export async function startGame(input: {
  lessonId: string;
  studentName: string;
  normalizedStudentName: string;
  locale: "el" | "en";
  db?: PrismaClient;
}) {
  const db = input.db ?? defaultPrisma;
  const lesson = await db.lesson.findUnique({
    where: { id: input.lessonId },
    include: {
      questions: { where: { mode: "GAME" }, orderBy: { position: "asc" }, include: { translations: true } },
    },
  });
  if (!lesson) throw new AppError("not_found", "Lesson not found", 404);
  if (lesson.status !== "READY") throw new AppError("not_ready", "Lesson is not ready", 409);
  if (lesson.questions.length === 0) throw new AppError("no_game", "No game questions are available", 409);

  const active = await db.attempt.findFirst({
    where: {
      lessonId: input.lessonId,
      normalizedStudentName: input.normalizedStudentName,
      mode: "GAME",
      gameStatus: "ACTIVE",
    },
    orderBy: { createdAt: "desc" },
  });

  if (active) {
    if (Date.now() - active.lastActivityAt.getTime() < GAME_TTL_MS) {
      return getGameState(active.id, input.normalizedStudentName, input.lessonId, input.locale, db);
    }
    await db.attempt.update({
      where: { id: active.id },
      data: { gameStatus: "ENDED", completedAt: new Date() },
    });
  }

  const order = lesson.questions.map((question) => question.id);
  const attempt = await db.attempt.create({
    data: {
      lessonId: input.lessonId,
      studentName: input.studentName,
      normalizedStudentName: input.normalizedStudentName,
      mode: "GAME",
      locale: input.locale,
      score: 0,
      maxScore: order.length,
      percentage: 0,
      passed: false,
      durationMs: 0,
      gameStatus: "ACTIVE",
      questionOrder: order,
      currentIndex: 0,
      lifelines: { fiftyFifty: false, askAudience: false },
      lastActivityAt: new Date(),
    },
  });
  return getGameState(attempt.id, input.normalizedStudentName, input.lessonId, input.locale, db);
}

async function loadGameAttempt(attemptId: string, normalizedStudentName: string, lessonId: string, db: PrismaClient) {
  const attempt = await db.attempt.findUnique({ where: { id: attemptId } });
  if (!attempt || attempt.lessonId !== lessonId || attempt.normalizedStudentName !== normalizedStudentName || attempt.mode !== "GAME") {
    throw new AppError("not_found", "Game session not found", 404);
  }
  return attempt;
}

async function loadQuestions(lessonId: string, attempt: GameAttempt, db: PrismaClient) {
  const ids = orderOf(attempt);
  const questions = await db.question.findMany({
    where: { lessonId, id: { in: ids } },
    include: { translations: true },
  });
  const byId = new Map(questions.map((question) => [question.id, question]));
  return ids.map((id) => byId.get(id)).filter((question): question is NonNullable<typeof question> => Boolean(question));
}

function gameQuestion(
  question: Awaited<ReturnType<typeof loadQuestions>>[number],
  locale: string,
  lessonLocale: string,
): StudentQuestion | null {
  return toStudentQuestion(question, locale, lessonLocale)?.question ?? null;
}

export async function getGameState(
  attemptId: string,
  normalizedStudentName: string,
  lessonId: string,
  locale: "el" | "en",
  db: PrismaClient = defaultPrisma,
) {
  const attempt = await loadGameAttempt(attemptId, normalizedStudentName, lessonId, db);
  const lesson = await db.lesson.findUniqueOrThrow({ where: { id: lessonId }, select: { sourceLocale: true, passThreshold: true } });
  const questions = await loadQuestions(lessonId, attempt, db);
  const lifelines = lifelinesOf(attempt);

  if (attempt.gameStatus !== "ACTIVE") {
    return endedState(attempt, questions, lesson.sourceLocale, locale, lifelines, db);
  }

  if (Date.now() - attempt.lastActivityAt.getTime() > GAME_TTL_MS) {
    await db.attempt.update({ where: { id: attempt.id }, data: { gameStatus: "ENDED", completedAt: new Date() } });
    return { status: "EXPIRED" as const, attemptId: attempt.id };
  }

  const question = questions[attempt.currentIndex];
  if (!question) {
    await db.attempt.update({
      where: { id: attempt.id },
      data: { gameStatus: "COMPLETED", completedAt: new Date(), percentage: 100, passed: true },
    });
    return endedState({ ...attempt, gameStatus: "COMPLETED" }, questions, lesson.sourceLocale, locale, lifelines, db);
  }

  return {
    status: "ACTIVE" as const,
    attemptId: attempt.id,
    score: attempt.score,
    level: attempt.currentIndex,
    total: questions.length,
    lifelines,
    question: gameQuestion(question, locale, lesson.sourceLocale),
  };
}

async function endedState(
  attempt: GameAttempt,
  questions: Awaited<ReturnType<typeof loadQuestions>>,
  lessonLocale: string,
  locale: string,
  lifelines: Lifelines,
  db: PrismaClient,
) {
  const answers = await db.attemptAnswer.findMany({ where: { attemptId: attempt.id } });
  const review = questions.map((question) => {
    const answer = answers.find((item) => item.questionId === question.id);
    const translation = pickTranslation(question.translations, locale, lessonLocale).translation;
    const options = Array.isArray(translation?.options) ? (translation.options as Array<{ id: string; text: string }>) : [];
    return {
      questionId: question.id,
      prompt: translation?.prompt ?? "",
      options,
      selectedOptionId: answer?.selectedOptionId ?? null,
      correctOptionId: question.correctOptionId,
      isCorrect: answer?.isCorrect ?? false,
      explanation: translation?.explanation ?? "",
      sourcePage: question.sourcePage,
    };
  });
  return {
    status: attempt.gameStatus === "COMPLETED" ? ("COMPLETED" as const) : ("ENDED" as const),
    attemptId: attempt.id,
    score: attempt.score,
    total: questions.length,
    percentage: attempt.percentage,
    passed: attempt.passed,
    lifelines,
    review,
  };
}

export async function answerGame(input: {
  attemptId: string;
  lessonId: string;
  normalizedStudentName: string;
  questionId: string;
  optionId: string;
  locale: "el" | "en";
  db?: PrismaClient;
}) {
  const db = input.db ?? defaultPrisma;
  const attempt = await loadGameAttempt(input.attemptId, input.normalizedStudentName, input.lessonId, db);
  if (attempt.gameStatus !== "ACTIVE") throw new AppError("game_ended", "This game has ended", 409);
  const questions = await loadQuestions(input.lessonId, attempt, db);
  const expected = questions[attempt.currentIndex];
  if (!expected || expected.id !== input.questionId) {
    throw new AppError("invalid_question", "That is not the current question", 422);
  }

  const lesson = await db.lesson.findUniqueOrThrow({ where: { id: input.lessonId }, select: { sourceLocale: true, passThreshold: true } });
  const translation = pickTranslation(expected.translations, input.locale, lesson.sourceLocale).translation;
  const options = Array.isArray(translation?.options) ? (translation.options as Array<{ id: string }>) : [];
  if (!options.some((option) => option.id === input.optionId)) {
    throw new AppError("invalid_answer", "Unknown option", 422);
  }

  const isCorrect = input.optionId === expected.correctOptionId;
  const nextIndex = attempt.currentIndex + 1;
  const completed = isCorrect && nextIndex >= questions.length;
  const score = attempt.score + (isCorrect ? 1 : 0);

  try {
    await db.$transaction([
      db.attemptAnswer.create({
        data: {
          attemptId: attempt.id,
          questionId: expected.id,
          selectedOptionId: input.optionId,
          isCorrect,
        },
      }),
      db.attempt.update({
        where: { id: attempt.id },
        data: {
          score,
          currentIndex: isCorrect ? nextIndex : attempt.currentIndex,
          reachedLevel: score,
          lastActivityAt: new Date(),
          ...(isCorrect && !completed
            ? {}
            : {
                gameStatus: completed ? "COMPLETED" : "ENDED",
                completedAt: new Date(),
                percentage: Math.round((score / questions.length) * 100),
                passed: completed,
                durationMs: Date.now() - attempt.startedAt.getTime(),
              }),
        },
      }),
    ]);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code: string }).code === "P2002") {
      throw new AppError("already_answered", "This question was already answered", 409);
    }
    throw error;
  }

  const explanation = translation?.explanation ?? "";
  const state = await getGameState(attempt.id, input.normalizedStudentName, input.lessonId, input.locale, db);
  return {
    result: {
      isCorrect,
      selectedOptionId: input.optionId,
      correctOptionId: expected.correctOptionId,
      explanation,
      sourcePage: expected.sourcePage,
    },
    state,
  };
}

function audienceDistribution(optionIds: string[], correctOptionId: string, seed: number): Record<string, number> {
  const correctShare = 50 + (seed % 21);
  const remaining = 100 - correctShare;
  const wrong = optionIds.filter((id) => id !== correctOptionId);
  const distribution: Record<string, number> = { [correctOptionId]: correctShare };
  if (wrong.length === 0) return { [correctOptionId]: 100 };
  let assigned = 0;
  wrong.forEach((id, index) => {
    const share =
      index === wrong.length - 1 ? remaining - assigned : Math.floor(remaining / wrong.length) + ((seed + index) % 5) - 2;
    const safeShare = Math.max(0, share);
    distribution[id] = safeShare;
    assigned += safeShare;
  });
  return distribution;
}

export async function useLifeline(input: {
  attemptId: string;
  lessonId: string;
  normalizedStudentName: string;
  lifeline: "fiftyFifty" | "askAudience";
  locale: "el" | "en";
  db?: PrismaClient;
}) {
  const db = input.db ?? defaultPrisma;
  const attempt = await loadGameAttempt(input.attemptId, input.normalizedStudentName, input.lessonId, db);
  if (attempt.gameStatus !== "ACTIVE") throw new AppError("game_ended", "This game has ended", 409);
  const lifelines = lifelinesOf(attempt);
  if (lifelines[input.lifeline]) throw new AppError("lifeline_used", "That lifeline was already used", 409);

  const questions = await loadQuestions(input.lessonId, attempt, db);
  const current = questions[attempt.currentIndex];
  if (!current) throw new AppError("no_question", "No active question", 409);
  const lesson = await db.lesson.findUniqueOrThrow({ where: { id: input.lessonId }, select: { sourceLocale: true } });
  const translation = pickTranslation(current.translations, input.locale, lesson.sourceLocale).translation;
  const options = Array.isArray(translation?.options) ? (translation.options as Array<{ id: string }>) : [];
  const optionIds = options.map((option) => option.id);

  const updated = { ...lifelines, [input.lifeline]: true };
  await db.attempt.update({
    where: { id: attempt.id },
    data: { lifelines: updated, lastActivityAt: new Date() },
  });

  if (input.lifeline === "fiftyFifty") {
    const wrong = optionIds.filter((id) => id !== current.correctOptionId).slice(0, 2);
    return { lifelines: updated, removedOptionIds: wrong };
  }

  const seed = attempt.id.split("").reduce((sum, char) => sum + char.charCodeAt(0), attempt.currentIndex);
  return { lifelines: updated, distribution: audienceDistribution(optionIds, current.correctOptionId, seed) };
}
