import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { startTestInfra, type TestInfra } from "./helpers/infra";
import { resetEnvCache } from "@/lib/env";

let infra: TestInfra;
let prisma: PrismaClient;
let cardsService: typeof import("@/server/services/cards");
let cardRoute: typeof import("@/app/api/admin/lessons/[lessonId]/cards/[cardId]/route");
let cookie: string;

beforeAll(async () => {
  infra = await startTestInfra();
  process.env.DATABASE_URL = infra.databaseUrl;
  process.env.AUTH_SECRET = "a".repeat(40);
  process.env.TEACHER_PASSWORD = "test";
  resetEnvCache();

  prisma = (await import("@/server/db")).prisma;
  cardsService = await import("@/server/services/cards");
  cardRoute = await import("@/app/api/admin/lessons/[lessonId]/cards/[cardId]/route");
  const session = await import("@/server/auth/session");
  cookie = await session.createSessionToken();
}, 120_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await infra?.stop();
});

function request(pathname: string, init: RequestInit = {}, withAuth = true) {
  const headers = new Headers(init.headers);
  if (withAuth) headers.set("cookie", `teacher_session=${cookie}`);
  headers.set("origin", "http://localhost:3000");
  if (init.body) headers.set("content-type", "application/json");
  return new Request(`http://localhost:3000${pathname}`, { ...init, headers });
}

function patchCard(lessonId: string, cardId: string, body: unknown, withAuth = true) {
  return cardRoute.PATCH(
    request(
      `/api/admin/lessons/${lessonId}/cards/${cardId}`,
      { method: "PATCH", body: JSON.stringify(body) },
      withAuth,
    ),
    { params: Promise.resolve({ lessonId, cardId }) },
  );
}

let sequence = 0;

async function createLessonWithDeck(status: "READY" | "GENERATING" = "READY") {
  sequence += 1;
  const classroom = await prisma.class.create({ data: { name: `Card editing ${sequence}-${Date.now()}` } });
  const lesson = await prisma.lesson.create({
    data: {
      classId: classroom.id,
      title: `Card lesson ${sequence}`,
      originalFilename: `cards-${sequence}.pdf`,
      storageKey: `lessons/cards-${sequence}/original.pdf`,
      checksum: `cards-checksum-${sequence}-${Math.random()}`,
      sizeBytes: 100,
      pageCount: 2,
      sourceLocale: "en",
      status,
    },
  });

  const first = await prisma.card.create({
    data: {
      lessonId: lesson.id,
      itemKey: `card-${sequence}-1`,
      position: 1,
      sourcePage: 1,
      translations: {
        create: [
          { locale: "el", prompt: "Πρώτη ερώτηση", answer: "Πρώτη απάντηση" },
          { locale: "en", prompt: "First prompt", answer: "First answer" },
        ],
      },
    },
  });
  const second = await prisma.card.create({
    data: {
      lessonId: lesson.id,
      itemKey: `card-${sequence}-2`,
      position: 2,
      sourcePage: 2,
      translations: {
        create: [
          { locale: "el", prompt: "Δεύτερη ερώτηση", answer: "Δεύτερη απάντηση" },
          { locale: "en", prompt: "Second prompt", answer: "Second answer" },
        ],
      },
    },
  });

  return { classroom, lesson, cards: [first, second] };
}

async function translationsFor(cardId: string) {
  const rows = await prisma.cardTranslation.findMany({ where: { cardId }, orderBy: { locale: "asc" } });
  return Object.fromEntries(rows.map((row) => [row.locale, { prompt: row.prompt, answer: row.answer }]));
}

describe("card editing service", () => {
  it("lists cards in deck order with both locale translations", async () => {
    const { lesson } = await createLessonWithDeck();
    const listed = await cardsService.listLessonCards(lesson.id);

    expect(listed).toHaveLength(2);
    expect(listed.map((card) => card.position)).toEqual([1, 2]);
    expect(listed[0].translations.el).toEqual({ prompt: "Πρώτη ερώτηση", answer: "Πρώτη απάντηση" });
    expect(listed[0].translations.en).toEqual({ prompt: "First prompt", answer: "First answer" });
    expect(listed[1].translations.el).toEqual({ prompt: "Δεύτερη ερώτηση", answer: "Δεύτερη απάντηση" });
    expect(listed[1].translations.en).toEqual({ prompt: "Second prompt", answer: "Second answer" });
  });

  it("updates both locale variants and returns the saved card", async () => {
    const { lesson, cards } = await createLessonWithDeck();

    const saved = await cardsService.updateCardTranslations(lesson.id, cards[0].id, {
      translations: {
        el: { prompt: "Νέα ερώτηση", answer: "Νέα απάντηση" },
        en: { prompt: "New prompt", answer: "New answer" },
      },
    });

    expect(saved.id).toBe(cards[0].id);
    expect(saved.translations.el).toEqual({ prompt: "Νέα ερώτηση", answer: "Νέα απάντηση" });
    expect(saved.translations.en).toEqual({ prompt: "New prompt", answer: "New answer" });
    expect(await translationsFor(cards[0].id)).toEqual({
      el: { prompt: "Νέα ερώτηση", answer: "Νέα απάντηση" },
      en: { prompt: "New prompt", answer: "New answer" },
    });

    const untouched = await translationsFor(cards[1].id);
    expect(untouched.el).toEqual({ prompt: "Δεύτερη ερώτηση", answer: "Δεύτερη απάντηση" });
  });

  it("rejects blank or whitespace text without changing any locale", async () => {
    const { lesson, cards } = await createLessonWithDeck();
    const before = await translationsFor(cards[0].id);

    await expect(
      cardsService.updateCardTranslations(lesson.id, cards[0].id, {
        translations: {
          el: { prompt: "   ", answer: "Απάντηση" },
          en: { prompt: "Prompt", answer: "Answer" },
        },
      }),
    ).rejects.toThrow();

    expect(await translationsFor(cards[0].id)).toEqual(before);
  });

  it("rejects an update that omits a locale without changing any locale", async () => {
    const { lesson, cards } = await createLessonWithDeck();
    const before = await translationsFor(cards[0].id);

    await expect(
      cardsService.updateCardTranslations(lesson.id, cards[0].id, {
        translations: {
          el: { prompt: "Μόνο ελληνικά", answer: "Μόνο ελληνικά" },
        },
      }),
    ).rejects.toThrow();

    expect(await translationsFor(cards[0].id)).toEqual(before);
  });

  it("rejects a card that belongs to a different lesson", async () => {
    const first = await createLessonWithDeck();
    const second = await createLessonWithDeck();
    const firstBefore = await translationsFor(first.cards[0].id);
    const secondBefore = await translationsFor(second.cards[0].id);

    await expect(
      cardsService.updateCardTranslations(first.lesson.id, second.cards[0].id, {
        translations: {
          el: { prompt: "Λάθος μάθημα", answer: "Λάθος μάθημα" },
          en: { prompt: "Wrong lesson", answer: "Wrong lesson" },
        },
      }),
    ).rejects.toThrow();

    expect(await translationsFor(first.cards[0].id)).toEqual(firstBefore);
    expect(await translationsFor(second.cards[0].id)).toEqual(secondBefore);
  });

  it("rejects an unknown lesson or card", async () => {
    const { lesson, cards } = await createLessonWithDeck();
    const validInput = {
      translations: {
        el: { prompt: "Ερώτηση", answer: "Απάντηση" },
        en: { prompt: "Prompt", answer: "Answer" },
      },
    };

    await expect(cardsService.updateCardTranslations("missing-lesson", cards[0].id, validInput)).rejects.toThrow();
    await expect(cardsService.updateCardTranslations(lesson.id, "missing-card", validInput)).rejects.toThrow();
  });

  it("rejects edits while the lesson is not ready", async () => {
    const { lesson, cards } = await createLessonWithDeck("GENERATING");
    const before = await translationsFor(cards[0].id);

    await expect(
      cardsService.updateCardTranslations(lesson.id, cards[0].id, {
        translations: {
          el: { prompt: "Πρόωρη ερώτηση", answer: "Πρόωρη απάντηση" },
          en: { prompt: "Early prompt", answer: "Early answer" },
        },
      }),
    ).rejects.toThrow();

    expect(await translationsFor(cards[0].id)).toEqual(before);
  });

  it("leaves questions, narration, videos, and card order unchanged", async () => {
    const { lesson, cards } = await createLessonWithDeck();
    await prisma.question.create({
      data: {
        lessonId: lesson.id,
        mode: "QUESTIONNAIRE",
        itemKey: "question-1",
        position: 1,
        type: "TRUE_FALSE",
        correctOptionId: "a",
        sourcePage: 1,
        translations: {
          create: [
            {
              locale: "el",
              prompt: "Η πρόταση είναι σωστή;",
              options: [
                { id: "a", text: "Σωστό" },
                { id: "b", text: "Λάθος" },
              ],
              explanation: "Από τη σελίδα 1.",
            },
            {
              locale: "en",
              prompt: "Is the statement true?",
              options: [
                { id: "a", text: "True" },
                { id: "b", text: "False" },
              ],
              explanation: "From page 1.",
            },
          ],
        },
      },
    });
    await prisma.narrationSegment.createMany({
      data: [
        { lessonId: lesson.id, pageNumber: 1, locale: "el", script: "Ελληνική αφήγηση" },
        { lessonId: lesson.id, pageNumber: 1, locale: "en", script: "English narration" },
      ],
    });
    await prisma.videoAsset.create({
      data: { lessonId: lesson.id, locale: "el", status: "READY", storageKey: "lessons/test/video.mp4" },
    });

    const snapshot = async () => ({
      questions: await prisma.question.findMany({
        where: { lessonId: lesson.id },
        orderBy: { id: "asc" },
        include: { translations: { orderBy: { locale: "asc" } } },
      }),
      narration: await prisma.narrationSegment.findMany({
        where: { lessonId: lesson.id },
        orderBy: [{ pageNumber: "asc" }, { locale: "asc" }],
      }),
      videos: await prisma.videoAsset.findMany({ where: { lessonId: lesson.id }, orderBy: { locale: "asc" } }),
      cardOrder: await prisma.card.findMany({
        where: { lessonId: lesson.id },
        orderBy: { position: "asc" },
        select: { id: true, position: true },
      }),
    });

    const before = await snapshot();
    await cardsService.updateCardTranslations(lesson.id, cards[0].id, {
      translations: {
        el: { prompt: "Μόνο η κάρτα αλλάζει", answer: "Μόνο η κάρτα αλλάζει" },
        en: { prompt: "Only the card changes", answer: "Only the card changes" },
      },
    });

    expect(await snapshot()).toEqual(before);
  });
});

describe("card editing API", () => {
  const validBody = {
    translations: {
      el: { prompt: "Αποθηκευμένη ερώτηση", answer: "Αποθηκευμένη απάντηση" },
      en: { prompt: "Saved prompt", answer: "Saved answer" },
    },
  };

  it("requires authentication and leaves the card unchanged", async () => {
    const { lesson, cards } = await createLessonWithDeck();
    const before = await translationsFor(cards[0].id);

    const response = await patchCard(lesson.id, cards[0].id, validBody, false);
    expect(response.status).toBe(401);
    expect(await translationsFor(cards[0].id)).toEqual(before);
  });

  it("saves a valid bilingual update", async () => {
    const { lesson, cards } = await createLessonWithDeck();

    const response = await patchCard(lesson.id, cards[0].id, validBody);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      card: { id: string; translations: { el: { prompt: string; answer: string }; en: { prompt: string; answer: string } } };
    };
    expect(body.card.id).toBe(cards[0].id);
    expect(body.card.translations).toEqual(validBody.translations);
    expect(await translationsFor(cards[0].id)).toEqual(validBody.translations);
  });

  it("rejects invalid input with a validation error", async () => {
    const { lesson, cards } = await createLessonWithDeck();
    const before = await translationsFor(cards[0].id);

    const response = await patchCard(lesson.id, cards[0].id, {
      translations: {
        el: { prompt: "   ", answer: "Απάντηση" },
        en: { prompt: "Prompt", answer: "Answer" },
      },
    });

    expect(response.status).toBe(422);
    expect(await translationsFor(cards[0].id)).toEqual(before);
  });

  it("rejects a non-ready lesson with a conflict", async () => {
    const { lesson, cards } = await createLessonWithDeck("GENERATING");
    const before = await translationsFor(cards[0].id);

    const response = await patchCard(lesson.id, cards[0].id, validBody);
    expect(response.status).toBe(409);
    expect(await translationsFor(cards[0].id)).toEqual(before);
  });

  it("rejects a card outside the lesson", async () => {
    const first = await createLessonWithDeck();
    const second = await createLessonWithDeck();
    const firstBefore = await translationsFor(first.cards[0].id);
    const secondBefore = await translationsFor(second.cards[0].id);

    const response = await patchCard(first.lesson.id, second.cards[0].id, validBody);
    expect(response.status).toBe(404);
    expect(await translationsFor(first.cards[0].id)).toEqual(firstBefore);
    expect(await translationsFor(second.cards[0].id)).toEqual(secondBefore);
  });
});
