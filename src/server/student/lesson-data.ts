import type { Prisma, QuestionType, ResourceKind } from "@prisma/client";
import { prisma } from "@/server/db";
import { getStorage } from "@/server/storage";
import type { Locale } from "@/lib/locale";
import { parseLessonRubric, type LessonRubric } from "@/lib/rubric";
import { getLessonQuestionnaireSummary, type ClassSummary } from "./class-summary";

export type StudentOption = { id: string; text: string };
export type StudentQuestion = { id: string; type: QuestionType; prompt: string; options: StudentOption[] };
export type StudentCard = { id: string; prompt: string; answer: string };
export type StudentResource = {
  id: string;
  kind: ResourceKind;
  title: string;
  description: string | null;
  url: string;
  youtubeId: string | null;
  sourcePage: number | null;
};
export type StudentRubricCriterion = { id: string; title: string; description: string };
export type StudentRubricLevel = { id: string; label: string; description: string };
export type StudentRubric = {
  criteria: StudentRubricCriterion[];
  levels: StudentRubricLevel[];
  fallback: boolean;
};
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
  classSummary: ClassSummary | null;
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

function localizeRubric(
  rubric: LessonRubric | null,
  locale: string,
  primary: string,
): StudentRubric | null {
  if (!rubric) return null;
  let fallback = false;
  const text = (value: { el: string; en: string }): string => {
    const selected = value[locale as "el" | "en"];
    if (selected) return selected;
    fallback = true;
    return value[primary as "el" | "en"] ?? value.el;
  };
  return {
    criteria: rubric.criteria.map((criterion) => ({
      id: criterion.id,
      title: text(criterion.title),
      description: text(criterion.description),
    })),
    levels: rubric.levels.map((level) => ({
      id: level.id,
      label: text(level.label),
      description: text(level.description),
    })),
    fallback,
  };
}

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
      resources: {
        where: { status: "APPROVED" },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      },
      questions: { orderBy: { position: "asc" }, include: questionInclude },
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

  const sourceAvailable = lesson.storageKey
    ? await getStorage()
        .exists(lesson.storageKey)
        .catch(() => false)
    : false;
  const sourceDocument = sourceAvailable
    ? {
        url: `/api/s/${encodeURIComponent(input.token)}/lessons/${lesson.id}/source`,
        filename: lesson.originalFilename,
      }
    : null;

  const rubric = localizeRubric(parseLessonRubric(lesson.rubric), input.locale, primary);

  const resources: StudentResource[] = lesson.resources.map((resource) => ({
    id: resource.id,
    kind: resource.kind,
    title: resource.title,
    description: resource.description,
    url: resource.url,
    youtubeId: resource.youtubeId,
    sourcePage: resource.sourcePage,
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
      classSummary: await getLessonQuestionnaireSummary(lesson.id, existingAttempt.percentage),
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
    resources,
    rubric,
    sourceDocument,
    existingResult,
    draftAnswers: (lesson.drafts[0]?.answers as Record<string, string> | undefined) ?? {},
    deckViewed: lesson.deckViews.length > 0,
    fallbackUsed,
    contentLocale: input.locale,
    primaryLocale: primary,
  };
}

export type StudentLessonData = NonNullable<Awaited<ReturnType<typeof loadLessonForStudent>>>;
