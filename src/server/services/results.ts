import type { AttemptMode, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/server/db";
import { AppError } from "@/lib/errors";

export type AttemptRow = {
  id: string;
  studentName: string;
  mode: AttemptMode;
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  durationMs: number;
  reachedLevel: number | null;
  completedAt: string;
};

export type QuestionStats = {
  questionId: string;
  prompt: string;
  correctRate: number;
  answered: number;
  options: Array<{ id: string; text: string; count: number }>;
};

export type LessonResults = {
  lesson: { id: string; title: string; classId: string; passThreshold: number };
  attempts: AttemptRow[];
  stats: {
    count: number;
    average: number | null;
    median: number | null;
    passRate: number | null;
    questionnaireCount: number;
    gameCount: number;
  };
  questions: QuestionStats[];
  deckViews: number;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[middle - 1] + sorted[middle]) / 2) : sorted[middle];
}

export async function getLessonResults(lessonId: string, db: PrismaClient = defaultPrisma): Promise<LessonResults> {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      title: true,
      classId: true,
      passThreshold: true,
      sourceLocale: true,
      questions: {
        where: { mode: "QUESTIONNAIRE" },
        orderBy: { position: "asc" },
        include: { translations: true },
      },
      attempts: {
        where: { completedAt: { not: null } },
        orderBy: { completedAt: "desc" },
        include: { answers: true },
      },
      deckViews: { select: { id: true } },
    },
  });
  if (!lesson) throw new AppError("not_found", "Lesson not found", 404);

  const attempts: AttemptRow[] = lesson.attempts.map((attempt) => ({
    id: attempt.id,
    studentName: attempt.studentName,
    mode: attempt.mode,
    score: attempt.score,
    maxScore: attempt.maxScore,
    percentage: attempt.percentage,
    passed: attempt.passed,
    durationMs: attempt.durationMs,
    reachedLevel: attempt.reachedLevel,
    completedAt: (attempt.completedAt ?? attempt.createdAt).toISOString(),
  }));

  const percentages = attempts.map((attempt) => attempt.percentage);
  const questionnaireAttempts = lesson.attempts.filter((attempt) => attempt.mode === "QUESTIONNAIRE");
  const gameAttempts = lesson.attempts.filter((attempt) => attempt.mode === "GAME");

  const questions: QuestionStats[] = lesson.questions.map((question) => {
    const translation =
      question.translations.find((item) => item.locale === lesson.sourceLocale) ?? question.translations[0];
    const options = Array.isArray(translation?.options)
      ? (translation.options as Array<{ id: string; text: string }>)
      : [];
    const answers = questionnaireAttempts
      .flatMap((attempt) => attempt.answers)
      .filter((answer) => answer.questionId === question.id);
    const correct = answers.filter((answer) => answer.isCorrect).length;
    return {
      questionId: question.id,
      prompt: translation?.prompt ?? "",
      correctRate: answers.length === 0 ? 0 : Math.round((correct / answers.length) * 100),
      answered: answers.length,
      options: options.map((option) => ({
        ...option,
        count: answers.filter((answer) => answer.selectedOptionId === option.id).length,
      })),
    };
  });
  questions.sort((a, b) => a.correctRate - b.correctRate);

  return {
    lesson: {
      id: lesson.id,
      title: lesson.title,
      classId: lesson.classId,
      passThreshold: lesson.passThreshold,
    },
    attempts,
    stats: {
      count: attempts.length,
      average: attempts.length === 0 ? null : Math.round(percentages.reduce((sum, value) => sum + value, 0) / attempts.length),
      median: median(percentages),
      passRate:
        attempts.length === 0 ? null : Math.round((attempts.filter((attempt) => attempt.passed).length / attempts.length) * 100),
      questionnaireCount: questionnaireAttempts.length,
      gameCount: gameAttempts.length,
    },
    questions,
    deckViews: lesson.deckViews.length,
  };
}

export type ClassResults = {
  class: { id: string; name: string };
  lessons: Array<{ id: string; title: string; attempts: number; average: number | null; passRate: number | null }>;
  students: Array<{ normalizedName: string; name: string; attempts: number; average: number | null; lessons: number }>;
  stats: { attempts: number; students: number; average: number | null };
};

export async function getClassResults(classId: string, db: PrismaClient = defaultPrisma): Promise<ClassResults> {
  const classroom = await db.class.findUnique({
    where: { id: classId },
    include: {
      lessons: {
        orderBy: { createdAt: "desc" },
        include: { attempts: { where: { completedAt: { not: null } } } },
      },
    },
  });
  if (!classroom) throw new AppError("not_found", "Class not found", 404);

  const lessons = classroom.lessons.map((lesson) => {
    const percentages = lesson.attempts.map((attempt) => attempt.percentage);
    return {
      id: lesson.id,
      title: lesson.title,
      attempts: lesson.attempts.length,
      average:
        percentages.length === 0
          ? null
          : Math.round(percentages.reduce((sum, value) => sum + value, 0) / percentages.length),
      passRate:
        lesson.attempts.length === 0
          ? null
          : Math.round((lesson.attempts.filter((attempt) => attempt.passed).length / lesson.attempts.length) * 100),
    };
  });

  const studentMap = new Map<string, { name: string; percentages: number[]; lessons: Set<string> }>();
  for (const lesson of classroom.lessons) {
    for (const attempt of lesson.attempts) {
      const existing = studentMap.get(attempt.normalizedStudentName) ?? {
        name: attempt.studentName,
        percentages: [],
        lessons: new Set<string>(),
      };
      existing.percentages.push(attempt.percentage);
      existing.lessons.add(lesson.id);
      studentMap.set(attempt.normalizedStudentName, existing);
    }
  }

  const students = [...studentMap.entries()].map(([normalizedName, value]) => ({
    normalizedName,
    name: value.name,
    attempts: value.percentages.length,
    average: Math.round(value.percentages.reduce((sum, item) => sum + item, 0) / value.percentages.length),
    lessons: value.lessons.size,
  }));

  const allPercentages = students.flatMap((student) => [student.average]);
  return {
    class: { id: classroom.id, name: classroom.name },
    lessons,
    students: students.sort((a, b) => a.name.localeCompare(b.name)),
    stats: {
      attempts: lessons.reduce((sum, lesson) => sum + lesson.attempts, 0),
      students: students.length,
      average:
        allPercentages.length === 0
          ? null
          : Math.round(allPercentages.reduce((sum, value) => sum + value, 0) / allPercentages.length),
    },
  };
}

export async function deleteAttempt(attemptId: string, db: PrismaClient = defaultPrisma) {
  const attempt = await db.attempt.findUnique({ where: { id: attemptId } });
  if (!attempt) throw new AppError("not_found", "Attempt not found", 404);
  await db.attempt.delete({ where: { id: attemptId } });
  return { ok: true };
}

export async function getAttemptForStudent(
  lessonId: string,
  attemptId: string,
  normalizedStudentName: string,
  db: PrismaClient = defaultPrisma,
) {
  const attempt = await db.attempt.findFirst({
    where: { id: attemptId, lessonId, normalizedStudentName, completedAt: { not: null } },
    include: { answers: true },
  });
  if (!attempt) throw new AppError("not_found", "Attempt not found", 404);
  return attempt;
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  return [columns.join(","), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))].join("\r\n");
}

export async function exportLessonCsv(lessonId: string, db: PrismaClient = defaultPrisma): Promise<string> {
  const results = await getLessonResults(lessonId, db);
  return toCsv(
    results.attempts.map((attempt) => ({
      lesson: results.lesson.title,
      student: attempt.studentName,
      mode: attempt.mode,
      score: attempt.score,
      max_score: attempt.maxScore,
      percentage: attempt.percentage,
      passed: attempt.passed,
      duration_ms: attempt.durationMs,
      completed_at: attempt.completedAt,
    })),
    ["lesson", "student", "mode", "score", "max_score", "percentage", "passed", "duration_ms", "completed_at"],
  );
}

export async function exportClassCsv(classId: string, db: PrismaClient = defaultPrisma): Promise<string> {
  const classroom = await db.class.findUnique({
    where: { id: classId },
    include: {
      lessons: {
        include: {
          attempts: {
            where: { completedAt: { not: null } },
            orderBy: { completedAt: "asc" },
          },
        },
      },
    },
  });
  if (!classroom) throw new AppError("not_found", "Class not found", 404);

  const rows = classroom.lessons.flatMap((lesson) =>
    lesson.attempts.map((attempt) => ({
      class: classroom.name,
      lesson: lesson.title,
      student: attempt.studentName,
      mode: attempt.mode,
      score: attempt.score,
      max_score: attempt.maxScore,
      percentage: attempt.percentage,
      passed: attempt.passed,
      duration_ms: attempt.durationMs,
      completed_at: (attempt.completedAt ?? attempt.createdAt).toISOString(),
    })),
  );

  return toCsv(rows, [
    "class",
    "lesson",
    "student",
    "mode",
    "score",
    "max_score",
    "percentage",
    "passed",
    "duration_ms",
    "completed_at",
  ]);
}
