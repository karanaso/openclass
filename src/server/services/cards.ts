import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/server/db";
import { ConflictError, NotFoundError } from "@/lib/errors";

const cardTextSchema = z
  .string()
  .trim()
  .min(1, "Card text is required")
  .max(2000, "Card text must be 2000 characters or fewer");

const cardTranslationSchema = z.object({
  prompt: cardTextSchema,
  answer: cardTextSchema,
});

export const cardUpdateSchema = z.object({
  translations: z.object({
    el: cardTranslationSchema,
    en: cardTranslationSchema,
  }),
});

export type CardUpdateInput = z.infer<typeof cardUpdateSchema>;

export type LessonCardTranslation = { prompt: string; answer: string };

export type LessonCard = {
  id: string;
  position: number;
  sourcePage: number;
  translations: { el: LessonCardTranslation; en: LessonCardTranslation };
};

type CardWithTranslations = {
  id: string;
  position: number;
  sourcePage: number;
  translations: Array<{ locale: string; prompt: string; answer: string }>;
};

function toLessonCard(card: CardWithTranslations): LessonCard {
  const translationFor = (locale: string): LessonCardTranslation => {
    const translation = card.translations.find((item) => item.locale === locale);
    return { prompt: translation?.prompt ?? "", answer: translation?.answer ?? "" };
  };

  return {
    id: card.id,
    position: card.position,
    sourcePage: card.sourcePage,
    translations: {
      el: translationFor("el"),
      en: translationFor("en"),
    },
  };
}

export async function listLessonCards(lessonId: string, db: PrismaClient = defaultPrisma): Promise<LessonCard[]> {
  const cards = await db.card.findMany({
    where: { lessonId },
    orderBy: { position: "asc" },
    include: { translations: true },
  });
  return cards.map(toLessonCard);
}

export async function updateCardTranslations(
  lessonId: string,
  cardId: string,
  input: unknown,
  db: PrismaClient = defaultPrisma,
): Promise<LessonCard> {
  const parsed = cardUpdateSchema.parse(input);

  return db.$transaction(async (tx) => {
    const lesson = await tx.lesson.findUnique({ where: { id: lessonId }, select: { status: true } });
    if (!lesson) throw new NotFoundError("Lesson not found");
    if (lesson.status !== "READY") {
      throw new ConflictError("Cards can only be edited when the lesson is ready");
    }

    const card = await tx.card.findFirst({ where: { id: cardId, lessonId }, select: { id: true } });
    if (!card) throw new NotFoundError("Card not found");

    for (const locale of ["el", "en"] as const) {
      const translation = parsed.translations[locale];
      await tx.cardTranslation.upsert({
        where: { cardId_locale: { cardId, locale } },
        create: { cardId, locale, prompt: translation.prompt, answer: translation.answer },
        update: { prompt: translation.prompt, answer: translation.answer },
      });
    }

    const updated = await tx.card.findUniqueOrThrow({
      where: { id: cardId },
      include: { translations: true },
    });
    return toLessonCard(updated);
  });
}
