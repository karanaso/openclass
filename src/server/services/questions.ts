import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { PrismaClient, QuestionMode, QuestionType } from "@prisma/client";
import { prisma as defaultPrisma } from "@/server/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";

const questionTextSchema = z.string().trim().min(1, "Question text is required").max(6000);

export const questionOptionSchema = z.object({
  id: z.string().trim().min(1).max(8),
  text: z.string().trim().min(1).max(3000),
});

export const questionTranslationSchema = z.object({
  prompt: questionTextSchema,
  options: z.array(questionOptionSchema).min(2).max(4),
  explanation: questionTextSchema,
});

const questionContentSchema = z.object({
  correctOptionId: z.string().trim().min(1).max(8),
  sourcePage: z.number().int().positive(),
  translations: z.object({
    el: questionTranslationSchema,
    en: questionTranslationSchema,
  }),
});

export const questionUpdateSchema = questionContentSchema.strict();

export const questionCreateSchema = questionContentSchema
  .extend({
    mode: z.enum(["QUESTIONNAIRE", "GAME"]),
    type: z.enum(["TRUE_FALSE", "MULTIPLE_CHOICE"]),
  })
  .strict();

export type QuestionOption = z.infer<typeof questionOptionSchema>;
export type QuestionTranslationInput = z.infer<typeof questionTranslationSchema>;
export type QuestionUpdateInput = z.infer<typeof questionUpdateSchema>;

export type EditableQuestion = {
  id: string;
  mode: QuestionMode;
  position: number;
  type: QuestionType;
  correctOptionId: string;
  sourcePage: number;
  translations: {
    el: QuestionTranslationInput;
    en: QuestionTranslationInput;
  };
};

type QuestionWithTranslations = {
  id: string;
  mode: QuestionMode;
  position: number;
  type: QuestionType;
  correctOptionId: string;
  sourcePage: number;
  translations: Array<{ locale: string; prompt: string; options: unknown; explanation: string }>;
};

function toQuestionTranslation(question: QuestionWithTranslations, locale: string): QuestionTranslationInput {
  const translation = question.translations.find((item) => item.locale === locale);
  return {
    prompt: translation?.prompt ?? "",
    options: Array.isArray(translation?.options) ? (translation.options as QuestionOption[]) : [],
    explanation: translation?.explanation ?? "",
  };
}

function toEditableQuestion(question: QuestionWithTranslations): EditableQuestion {
  return {
    id: question.id,
    mode: question.mode,
    position: question.position,
    type: question.type,
    correctOptionId: question.correctOptionId,
    sourcePage: question.sourcePage,
    translations: {
      el: toQuestionTranslation(question, "el"),
      en: toQuestionTranslation(question, "en"),
    },
  };
}

export async function listLessonQuestions(
  lessonId: string,
  db: PrismaClient = defaultPrisma,
): Promise<EditableQuestion[]> {
  const questions = await db.question.findMany({
    where: { lessonId },
    orderBy: [{ mode: "asc" }, { position: "asc" }],
    include: { translations: true },
  });
  return questions.map(toEditableQuestion);
}

const OPTION_COUNT: Record<QuestionType, number> = {
  TRUE_FALSE: 2,
  MULTIPLE_CHOICE: 4,
};

function assertQuestionContent(type: QuestionType, content: QuestionUpdateInput) {
  const expected = OPTION_COUNT[type];
  const idsByLocale = {
    el: content.translations.el.options.map((option) => option.id),
    en: content.translations.en.options.map((option) => option.id),
  };

  for (const locale of ["el", "en"] as const) {
    const ids = idsByLocale[locale];
    if (ids.length !== expected) {
      throw new ValidationError(
        `A ${type === "TRUE_FALSE" ? "true/false" : "multiple-choice"} question needs exactly ${expected} options in ${locale}`,
      );
    }
    if (new Set(ids).size !== ids.length) {
      throw new ValidationError(`Option ids must be unique in ${locale}`);
    }
    if (!ids.includes(content.correctOptionId)) {
      throw new ValidationError(`Correct option is missing from the ${locale} options`);
    }
  }

  if (idsByLocale.el.some((id, index) => id !== idsByLocale.en[index])) {
    throw new ValidationError("Option ids must be aligned across locales");
  }
}

function assertSourcePage(sourcePage: number, pageCount: number | null) {
  if (pageCount !== null && sourcePage > pageCount) {
    throw new ValidationError("Source page is outside the lesson");
  }
}

export async function updateQuestion(
  lessonId: string,
  questionId: string,
  input: unknown,
  db: PrismaClient = defaultPrisma,
): Promise<EditableQuestion> {
  const parsed = questionUpdateSchema.parse(input);

  return db.$transaction(async (tx) => {
    const lesson = await tx.lesson.findUnique({
      where: { id: lessonId },
      select: { status: true, pageCount: true },
    });
    if (!lesson) throw new NotFoundError("Lesson not found");
    if (lesson.status !== "READY") {
      throw new ConflictError("Questions can only be edited when the lesson is ready");
    }
    assertSourcePage(parsed.sourcePage, lesson.pageCount);

    const question = await tx.question.findFirst({
      where: { id: questionId, lessonId },
      select: { id: true, type: true },
    });
    if (!question) throw new NotFoundError("Question not found");
    assertQuestionContent(question.type, parsed);

    await tx.question.update({
      where: { id: questionId },
      data: {
        correctOptionId: parsed.correctOptionId,
        sourcePage: parsed.sourcePage,
      },
    });

    for (const locale of ["el", "en"] as const) {
      const translation = parsed.translations[locale];
      await tx.questionTranslation.upsert({
        where: { questionId_locale: { questionId, locale } },
        create: {
          questionId,
          locale,
          prompt: translation.prompt,
          options: translation.options,
          explanation: translation.explanation,
        },
        update: {
          prompt: translation.prompt,
          options: translation.options,
          explanation: translation.explanation,
        },
      });
    }

    const updated = await tx.question.findUniqueOrThrow({
      where: { id: questionId },
      include: { translations: true },
    });
    return toEditableQuestion(updated);
  });
}

export async function createQuestion(
  lessonId: string,
  input: unknown,
  db: PrismaClient = defaultPrisma,
): Promise<EditableQuestion> {
  const parsed = questionCreateSchema.parse(input);

  return db.$transaction(async (tx) => {
    const lesson = await tx.lesson.findUnique({
      where: { id: lessonId },
      select: { status: true, pageCount: true },
    });
    if (!lesson) throw new NotFoundError("Lesson not found");
    if (lesson.status !== "READY") {
      throw new ConflictError("Questions can only be edited when the lesson is ready");
    }
    assertSourcePage(parsed.sourcePage, lesson.pageCount);
    assertQuestionContent(parsed.type, parsed);

    const aggregate = await tx.question.aggregate({
      where: { lessonId, mode: parsed.mode },
      _max: { position: true },
    });

    const created = await tx.question.create({
      data: {
        lessonId,
        mode: parsed.mode,
        itemKey: `manual-${randomUUID()}`,
        position: (aggregate._max.position ?? 0) + 1,
        type: parsed.type,
        correctOptionId: parsed.correctOptionId,
        sourcePage: parsed.sourcePage,
        translations: {
          create: (["el", "en"] as const).map((locale) => ({
            locale,
            prompt: parsed.translations[locale].prompt,
            options: parsed.translations[locale].options,
            explanation: parsed.translations[locale].explanation,
          })),
        },
      },
      include: { translations: true },
    });

    return toEditableQuestion(created);
  });
}
