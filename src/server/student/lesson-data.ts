import type { Prisma, QuestionType } from "@prisma/client";
import { prisma } from "@/server/db";
import type { Locale } from "@/lib/locale";

export type StudentOption = { id: string; text: string };
export type StudentQuestion = { id: string; type: QuestionType; prompt: string; options: StudentOption[] };
export type StudentCard = { id: string; prompt: string; answer: string };
export type StudentFeedback = {
  questionId: string;
  selectedOptionId: string | null;
  correctOptionId: string;
  isCorrect: boolean;
  explanation: string;
  sourcePage: number;
};
export type QuestionnaireResult = {
  attemptId: string;
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  durationMs: number;
  completedAt: string;
  feedback: StudentFeedback[];
};
export type StudentVideo = {
  locale: string;
  status: string;
  videoUrl: string | null;
  captionsUrl: string | null;
  posterUrl: string | null;
};

export function pickTranslation<T extends { locale: string }>(
  translations: T[],
  locale: string,
  primary: string,
): { translation: T | undefined; fallback: boolean } {
  const exact = translations.find((item) => item.locale === locale);
  if (exact) return { translation: exact, fallback: false };
  const fallback = translations.find((item) => item.locale === primary) ?? translations[0];
  return { translation: fallback, fallback: Boolean(fallback) && locale !== primary };
}

export function toStudentQuestion(
  question: {
    id: string;
    type: QuestionType;
    translations: Array<{ locale: string; prompt: string; options: Prisma.JsonValue; explanation: string }>;
  },
  locale: string,
  primary: string,
): { question: StudentQuestion; fallback: boolean } | null {
  const { translation, fallback } = pickTranslation(question.translations, locale, primary);
  if (!translation) return null;
  const options = Array.isArray(translation.options) ? (translation.options as StudentOption[]) : [];
  return {
    question: { id: question.id, type: question.type, prompt: translation.prompt, options },
    fallback,
  };
}

const questionInclude = {
  translations: true,
} satisfies Prisma.QuestionInclude;

export async function loadLessonForStudent(input: {
  lessonId: string;
  locale: Locale;
  token: string;
  normalizedStudentName: string;
}) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: input.lessonId },
    include: {
      class: true,
      cards: { orderBy: { position: "asc" }, include: { translations: true } },
      questions: { orderBy: { position: "asc" }, include: questionInclude },
      videos: true,
      attempts: {
        where: {
          normalizedStudentName: input.normalizedStudentName,
          mode: "QUESTIONNAIRE",
          completedAt: { not: null },
        },
        orderBy: { completedAt: "desc" },
        take: 1,
        include: {
          answers: {
            include: {
              question: { include: questionInclude },
            },
          },
        },
      },
      drafts: {
        where: { normalizedStudentName: input.normalizedStudentName },
        take: 1,
      },
      deckViews: {
        where: { normalizedStudentName: input.normalizedStudentName },
        take: 1,
      },
    },
  });
  if (!lesson) return null;

  const primary = lesson.sourceLocale;
  let fallbackUsed = false;

  const cards: StudentCard[] = lesson.cards
    .map((card) => {
      const { translation, fallback } = pickTranslation(card.translations, input.locale, primary);
      if (!translation) return null;
      if (fallback) fallbackUsed = true;
      return { id: card.id, prompt: translation.prompt, answer: translation.answer };
    })
    .filter((card): card is StudentCard => Boolean(card));

  const questionnaire: StudentQuestion[] = [];
  for (const question of lesson.questions.filter((item) => item.mode === "QUESTIONNAIRE")) {
    const mapped = toStudentQuestion(question, input.locale, primary);
    if (mapped) {
      if (mapped.fallback) fallbackUsed = true;
      questionnaire.push(mapped.question);
    }
  }

  const game: StudentQuestion[] = [];
  for (const question of lesson.questions.filter((item) => item.mode === "GAME")) {
    const mapped = toStudentQuestion(question, input.locale, primary);
    if (mapped) {
      if (mapped.fallback) fallbackUsed = true;
      game.push(mapped.question);
    }
  }

  const videos: StudentVideo[] = lesson.videos.map((video) => ({
    locale: video.locale,
    status: video.status,
    videoUrl:
      video.status === "READY"
        ? `/api/s/${encodeURIComponent(input.token)}/lessons/${lesson.id}/media/${video.locale}/video`
        : null,
    captionsUrl:
      video.status === "READY"
        ? `/api/s/${encodeURIComponent(input.token)}/lessons/${lesson.id}/media/${video.locale}/captions`
        : null,
    posterUrl:
      video.status === "READY"
        ? `/api/s/${encodeURIComponent(input.token)}/lessons/${lesson.id}/media/${video.locale}/poster`
        : null,
  }));

  const existingAttempt = lesson.attempts[0];
  let existingResult: QuestionnaireResult | null = null;
  if (existingAttempt) {
    const feedback: StudentFeedback[] = lesson.questions
      .filter((question) => question.mode === "QUESTIONNAIRE")
      .map((question) => {
        const answer = existingAttempt.answers.find((item) => item.questionId === question.id);
        const { translation } = pickTranslation(question.translations, input.locale, primary);
        return {
          questionId: question.id,
          selectedOptionId: answer?.selectedOptionId ?? null,
          correctOptionId: question.correctOptionId,
          isCorrect: answer?.isCorrect ?? false,
          explanation: translation?.explanation ?? "",
          sourcePage: question.sourcePage,
        };
      });
    existingResult = {
      attemptId: existingAttempt.id,
      score: existingAttempt.score,
      maxScore: existingAttempt.maxScore,
      percentage: existingAttempt.percentage,
      passed: existingAttempt.passed,
      durationMs: existingAttempt.durationMs,
      completedAt: existingAttempt.completedAt?.toISOString() ?? existingAttempt.createdAt.toISOString(),
      feedback,
    };
  }

  return {
    lesson: {
      id: lesson.id,
      title: lesson.title,
      classId: lesson.classId,
      className: lesson.class.name,
      status: lesson.status,
      sourceLocale: primary,
      retakeEnabled: lesson.retakeEnabled,
      passThreshold: lesson.passThreshold,
    },
    cards,
    questionnaire,
    game,
    videos,
    existingResult,
    draftAnswers: (lesson.drafts[0]?.answers as Record<string, string> | undefined) ?? {},
    deckViewed: lesson.deckViews.length > 0,
    fallbackUsed,
    contentLocale: input.locale,
    primaryLocale: primary,
  };
}

export type StudentLessonData = NonNullable<Awaited<ReturnType<typeof loadLessonForStudent>>>;
