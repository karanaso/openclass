import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient, QuestionMode, QuestionType } from "@prisma/client";
import { startTestInfra, type TestInfra } from "./helpers/infra";
import { resetEnvCache } from "@/lib/env";

let infra: TestInfra;
let prisma: PrismaClient;
let questionsService: typeof import("@/server/services/questions");
let questionsRoute: typeof import("@/app/api/admin/lessons/[lessonId]/questions/route");
let questionRoute: typeof import("@/app/api/admin/lessons/[lessonId]/questions/[questionId]/route");
let cookie: string;

beforeAll(async () => {
  infra = await startTestInfra();
  process.env.DATABASE_URL = infra.databaseUrl;
  process.env.AUTH_SECRET = "a".repeat(40);
  process.env.TEACHER_PASSWORD = "test";
  resetEnvCache();

  prisma = (await import("@/server/db")).prisma;
  questionsService = await import("@/server/services/questions");
  questionsRoute = await import("@/app/api/admin/lessons/[lessonId]/questions/route");
  questionRoute = await import("@/app/api/admin/lessons/[lessonId]/questions/[questionId]/route");
  const session = await import("@/server/auth/session");
  cookie = await session.createSessionToken();
}, 120_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await infra?.stop();
});

let sequence = 0;

function options(count: number, prefix: string) {
  return Array.from({ length: count }, (_, index) => ({
    id: String.fromCharCode(97 + index),
    text: `${prefix} option ${index + 1}`,
  }));
}

function translations(type: QuestionType, suffix: string) {
  const count = type === "TRUE_FALSE" ? 2 : 4;
  return {
    el: {
      prompt: `Ελληνική ερώτηση ${suffix}`,
      options: options(count, `Ελληνική ${suffix}`),
      explanation: `Ελληνική εξήγηση ${suffix}`,
    },
    en: {
      prompt: `English question ${suffix}`,
      options: options(count, `English ${suffix}`),
      explanation: `English explanation ${suffix}`,
    },
  };
}

async function addQuestion(input: {
  lessonId: string;
  mode: QuestionMode;
  itemKey: string;
  position: number;
  type?: QuestionType;
  correctOptionId?: string;
  sourcePage?: number;
  suffix?: string;
}) {
  const type = input.type ?? "TRUE_FALSE";
  return prisma.question.create({
    data: {
      lessonId: input.lessonId,
      mode: input.mode,
      itemKey: input.itemKey,
      position: input.position,
      type,
      correctOptionId: input.correctOptionId ?? "a",
      sourcePage: input.sourcePage ?? 1,
      translations: {
        create: (["el", "en"] as const).map((locale) => ({
          locale,
          ...translations(type, input.suffix ?? input.itemKey)[locale],
        })),
      },
    },
  });
}

async function createLessonWithQuestions(status: "READY" | "GENERATING" = "READY") {
  sequence += 1;
  const classroom = await prisma.class.create({ data: { name: `Question editing ${sequence}-${Date.now()}` } });
  const lesson = await prisma.lesson.create({
    data: {
      classId: classroom.id,
      title: `Question lesson ${sequence}`,
      originalFilename: `questions-${sequence}.pdf`,
      storageKey: `lessons/questions-${sequence}/original.pdf`,
      checksum: `questions-checksum-${sequence}-${Math.random()}`,
      sizeBytes: 100,
      pageCount: 3,
      sourceLocale: "en",
      status,
    },
  });

  const questionnaire = await addQuestion({
    lessonId: lesson.id,
    mode: "QUESTIONNAIRE",
    itemKey: `questionnaire-${sequence}-1`,
    position: 1,
    suffix: `q${sequence}-1`,
  });
  const questionnaireSecond = await addQuestion({
    lessonId: lesson.id,
    mode: "QUESTIONNAIRE",
    itemKey: `questionnaire-${sequence}-2`,
    position: 2,
    type: "MULTIPLE_CHOICE",
    suffix: `q${sequence}-2`,
  });
  const game = await addQuestion({
    lessonId: lesson.id,
    mode: "GAME",
    itemKey: `game-${sequence}-1`,
    position: 1,
    suffix: `g${sequence}-1`,
  });

  return { classroom, lesson, questionnaire, questionnaireSecond, game };
}

function request(pathname: string, init: RequestInit = {}, withAuth = true) {
  const headers = new Headers(init.headers);
  if (withAuth) headers.set("cookie", `teacher_session=${cookie}`);
  headers.set("origin", "http://localhost:3000");
  if (init.body) headers.set("content-type", "application/json");
  return new Request(`http://localhost:3000${pathname}`, { ...init, headers });
}

function postQuestion(lessonId: string, body: unknown, withAuth = true) {
  return questionsRoute.POST(
    request(`/api/admin/lessons/${lessonId}/questions`, { method: "POST", body: JSON.stringify(body) }, withAuth),
    { params: Promise.resolve({ lessonId }) },
  );
}

function patchQuestion(lessonId: string, questionId: string, body: unknown, withAuth = true) {
  return questionRoute.PATCH(
    request(
      `/api/admin/lessons/${lessonId}/questions/${questionId}`,
      { method: "PATCH", body: JSON.stringify(body) },
      withAuth,
    ),
    { params: Promise.resolve({ lessonId, questionId }) },
  );
}

function contentFor(type: QuestionType, suffix: string) {
  return {
    correctOptionId: "b",
    sourcePage: 2,
    translations: translations(type, suffix),
  };
}

describe("question editing service", () => {
  it("lists both modes in position order with both locale translations", async () => {
    const { lesson } = await createLessonWithQuestions();

    const listed = await questionsService.listLessonQuestions(lesson.id);

    const questionnaire = listed.filter((question) => question.mode === "QUESTIONNAIRE");
    const game = listed.filter((question) => question.mode === "GAME");

    expect(listed).toHaveLength(3);
    expect(questionnaire.map((question) => question.position)).toEqual([1, 2]);
    expect(game.map((question) => question.position)).toEqual([1]);
    expect(listed[0].translations.el.prompt).toContain("Ελληνική ερώτηση");
    expect(listed[0].translations.en.prompt).toContain("English question");
    expect(questionnaire[0].translations.el.options).toHaveLength(2);
    expect(questionnaire[1].translations.en.options).toHaveLength(4);
  });

  it("does not list questions from another lesson", async () => {
    const first = await createLessonWithQuestions();
    const second = await createLessonWithQuestions();

    const listed = await questionsService.listLessonQuestions(first.lesson.id);

    expect(listed).toHaveLength(3);
    expect(listed.map((question) => question.id)).not.toContain(second.game.id);
  });

  describe("question updates", () => {
    async function storedQuestion(questionId: string) {
      const row = await prisma.question.findUniqueOrThrow({
        where: { id: questionId },
        include: { translations: { orderBy: { locale: "asc" } } },
      });
      return {
        type: row.type,
        mode: row.mode,
        correctOptionId: row.correctOptionId,
        sourcePage: row.sourcePage,
        translations: row.translations.map((translation) => ({
          locale: translation.locale,
          prompt: translation.prompt,
          options: translation.options,
          explanation: translation.explanation,
        })),
      };
    }

    it("updates both locales, the correct option, and the source page", async () => {
      const { lesson, questionnaire, questionnaireSecond } = await createLessonWithQuestions();
      const beforeOther = await storedQuestion(questionnaireSecond.id);

      const saved = await questionsService.updateQuestion(
        lesson.id,
        questionnaire.id,
        contentFor("TRUE_FALSE", "updated"),
      );

      expect(saved.id).toBe(questionnaire.id);
      expect(saved.correctOptionId).toBe("b");
      expect(saved.sourcePage).toBe(2);
      expect(saved.translations.el.prompt).toBe("Ελληνική ερώτηση updated");
      expect(saved.translations.en.prompt).toBe("English question updated");
      expect(saved.translations.el.options).toHaveLength(2);

      const stored = await storedQuestion(questionnaire.id);
      expect(stored.correctOptionId).toBe("b");
      expect(stored.sourcePage).toBe(2);
      expect(stored.translations[0].prompt).toBe("Ελληνική ερώτηση updated");
      expect(stored.translations[1].prompt).toBe("English question updated");
      expect(await storedQuestion(questionnaireSecond.id)).toEqual(beforeOther);
    });

    it("rejects blank content without changing any locale", async () => {
      const { lesson, questionnaire } = await createLessonWithQuestions();
      const before = await storedQuestion(questionnaire.id);
      const input = contentFor("TRUE_FALSE", "blank");
      input.translations.el.prompt = "   ";

      await expect(questionsService.updateQuestion(lesson.id, questionnaire.id, input)).rejects.toThrow();

      expect(await storedQuestion(questionnaire.id)).toEqual(before);
    });

    it("rejects the wrong option count for each type", async () => {
      const { lesson, questionnaire, questionnaireSecond } = await createLessonWithQuestions();
      const trueFalseBefore = await storedQuestion(questionnaire.id);
      const multipleChoiceBefore = await storedQuestion(questionnaireSecond.id);

      const tooMany = contentFor("TRUE_FALSE", "too-many");
      tooMany.translations.el.options = options(4, "Extra");
      tooMany.translations.en.options = options(4, "Extra");
      await expect(questionsService.updateQuestion(lesson.id, questionnaire.id, tooMany)).rejects.toThrow();

      const tooFew = contentFor("MULTIPLE_CHOICE", "too-few");
      tooFew.translations.el.options = options(2, "Few");
      tooFew.translations.en.options = options(2, "Few");
      await expect(questionsService.updateQuestion(lesson.id, questionnaireSecond.id, tooFew)).rejects.toThrow();

      expect(await storedQuestion(questionnaire.id)).toEqual(trueFalseBefore);
      expect(await storedQuestion(questionnaireSecond.id)).toEqual(multipleChoiceBefore);
    });

    it("rejects misaligned option ids across locales", async () => {
      const { lesson, questionnaire } = await createLessonWithQuestions();
      const before = await storedQuestion(questionnaire.id);
      const input = contentFor("TRUE_FALSE", "misaligned");
      input.translations.en.options = [...input.translations.en.options].reverse();

      await expect(questionsService.updateQuestion(lesson.id, questionnaire.id, input)).rejects.toThrow();

      expect(await storedQuestion(questionnaire.id)).toEqual(before);
    });

    it("rejects a correct option that is missing", async () => {
      const { lesson, questionnaire } = await createLessonWithQuestions();
      const before = await storedQuestion(questionnaire.id);

      await expect(
        questionsService.updateQuestion(lesson.id, questionnaire.id, {
          ...contentFor("TRUE_FALSE", "missing-correct"),
          correctOptionId: "d",
        }),
      ).rejects.toThrow();

      expect(await storedQuestion(questionnaire.id)).toEqual(before);
    });

    it("rejects a source page outside the lesson", async () => {
      const { lesson, questionnaire } = await createLessonWithQuestions();
      const before = await storedQuestion(questionnaire.id);

      await expect(
        questionsService.updateQuestion(lesson.id, questionnaire.id, {
          ...contentFor("TRUE_FALSE", "bad-page"),
          sourcePage: 4,
        }),
      ).rejects.toThrow();

      expect(await storedQuestion(questionnaire.id)).toEqual(before);
    });

    it("rejects type and mode changes", async () => {
      const { lesson, questionnaire } = await createLessonWithQuestions();
      const before = await storedQuestion(questionnaire.id);

      await expect(
        questionsService.updateQuestion(lesson.id, questionnaire.id, {
          ...contentFor("TRUE_FALSE", "type-change"),
          type: "MULTIPLE_CHOICE",
        }),
      ).rejects.toThrow();
      await expect(
        questionsService.updateQuestion(lesson.id, questionnaire.id, {
          ...contentFor("TRUE_FALSE", "mode-change"),
          mode: "GAME",
        }),
      ).rejects.toThrow();

      expect(await storedQuestion(questionnaire.id)).toEqual(before);
    });

    it("rejects a question from another lesson", async () => {
      const first = await createLessonWithQuestions();
      const second = await createLessonWithQuestions();
      const firstBefore = await storedQuestion(first.questionnaire.id);
      const secondBefore = await storedQuestion(second.questionnaire.id);

      await expect(
        questionsService.updateQuestion(first.lesson.id, second.questionnaire.id, contentFor("TRUE_FALSE", "foreign")),
      ).rejects.toThrow();

      expect(await storedQuestion(first.questionnaire.id)).toEqual(firstBefore);
      expect(await storedQuestion(second.questionnaire.id)).toEqual(secondBefore);
    });

    it("rejects updates while the lesson is not ready", async () => {
      const { lesson, questionnaire } = await createLessonWithQuestions("GENERATING");
      const before = await storedQuestion(questionnaire.id);

      await expect(
        questionsService.updateQuestion(lesson.id, questionnaire.id, contentFor("TRUE_FALSE", "not-ready")),
      ).rejects.toThrow();

      expect(await storedQuestion(questionnaire.id)).toEqual(before);
    });
  });

  describe("question creation", () => {
    it("appends a questionnaire question after the last one", async () => {
      const { lesson } = await createLessonWithQuestions();

      const saved = await questionsService.createQuestion(lesson.id, {
        ...contentFor("MULTIPLE_CHOICE", "new-questionnaire"),
        mode: "QUESTIONNAIRE",
        type: "MULTIPLE_CHOICE",
      });

      expect(saved.mode).toBe("QUESTIONNAIRE");
      expect(saved.type).toBe("MULTIPLE_CHOICE");
      expect(saved.position).toBe(3);
      expect(saved.correctOptionId).toBe("b");
      expect(saved.sourcePage).toBe(2);
      expect(saved.translations.el.prompt).toBe("Ελληνική ερώτηση new-questionnaire");
      expect(saved.translations.en.options).toHaveLength(4);

      const row = await prisma.question.findUniqueOrThrow({ where: { id: saved.id } });
      expect(row.itemKey).toMatch(/^manual-/);
      expect(
        await prisma.question.count({ where: { lessonId: lesson.id, mode: "QUESTIONNAIRE" } }),
      ).toBe(3);
    });

    it("appends a game question after the last one", async () => {
      const { lesson } = await createLessonWithQuestions();

      const saved = await questionsService.createQuestion(lesson.id, {
        ...contentFor("TRUE_FALSE", "new-game"),
        mode: "GAME",
        type: "TRUE_FALSE",
      });

      expect(saved.mode).toBe("GAME");
      expect(saved.position).toBe(2);
      expect(
        await prisma.question.count({ where: { lessonId: lesson.id, mode: "GAME" } }),
      ).toBe(2);
    });

    it("rejects invalid content without inserting a question", async () => {
      const { lesson } = await createLessonWithQuestions();
      const before = await prisma.question.count({ where: { lessonId: lesson.id } });
      const input = {
        ...contentFor("TRUE_FALSE", "invalid"),
        mode: "QUESTIONNAIRE" as const,
        type: "TRUE_FALSE" as const,
      };
      input.translations.el.options = options(4, "Wrong");

      await expect(questionsService.createQuestion(lesson.id, input)).rejects.toThrow();

      expect(await prisma.question.count({ where: { lessonId: lesson.id } })).toBe(before);
    });

    it("rejects a source page outside the lesson", async () => {
      const { lesson } = await createLessonWithQuestions();

      await expect(
        questionsService.createQuestion(lesson.id, {
          ...contentFor("TRUE_FALSE", "bad-page"),
          mode: "QUESTIONNAIRE",
          type: "TRUE_FALSE",
          sourcePage: 4,
        }),
      ).rejects.toThrow();

      expect(await prisma.question.count({ where: { lessonId: lesson.id } })).toBe(3);
    });

    it("rejects creation while the lesson is not ready", async () => {
      const { lesson } = await createLessonWithQuestions("GENERATING");

      await expect(
        questionsService.createQuestion(lesson.id, {
          ...contentFor("TRUE_FALSE", "not-ready"),
          mode: "QUESTIONNAIRE",
          type: "TRUE_FALSE",
        }),
      ).rejects.toThrow();

      expect(await prisma.question.count({ where: { lessonId: lesson.id } })).toBe(3);
    });

    it("rejects an unknown lesson", async () => {
      await expect(
        questionsService.createQuestion("missing-lesson", {
          ...contentFor("TRUE_FALSE", "missing"),
          mode: "QUESTIONNAIRE",
          type: "TRUE_FALSE",
        }),
      ).rejects.toThrow();
    });
  });
});

describe("question editing API", () => {
  const createBody = {
    ...contentFor("MULTIPLE_CHOICE", "api-created"),
    mode: "QUESTIONNAIRE" as const,
    type: "MULTIPLE_CHOICE" as const,
  };

  it("requires authentication for creation and leaves the question set unchanged", async () => {
    const { lesson } = await createLessonWithQuestions();

    const response = await postQuestion(lesson.id, createBody, false);

    expect(response.status).toBe(401);
    expect(await prisma.question.count({ where: { lessonId: lesson.id } })).toBe(3);
  });

  it("requires authentication for updates and leaves the question unchanged", async () => {
    const { lesson, questionnaire } = await createLessonWithQuestions();
    const before = await prisma.questionTranslation.findMany({
      where: { questionId: questionnaire.id },
      orderBy: { locale: "asc" },
    });

    const response = await patchQuestion(lesson.id, questionnaire.id, contentFor("TRUE_FALSE", "unauth"), false);

    expect(response.status).toBe(401);
    expect(
      await prisma.questionTranslation.findMany({
        where: { questionId: questionnaire.id },
        orderBy: { locale: "asc" },
      }),
    ).toEqual(before);
  });

  it("creates a question and returns it", async () => {
    const { lesson } = await createLessonWithQuestions();

    const response = await postQuestion(lesson.id, createBody);
    expect(response.status).toBe(201);

    const body = (await response.json()) as {
      question: { id: string; mode: string; position: number; translations: { el: { prompt: string } } };
    };
    expect(body.question.mode).toBe("QUESTIONNAIRE");
    expect(body.question.position).toBe(3);
    expect(body.question.translations.el.prompt).toBe("Ελληνική ερώτηση api-created");
    expect(await prisma.question.count({ where: { lessonId: lesson.id } })).toBe(4);
  });

  it("updates a question and returns it", async () => {
    const { lesson, questionnaire } = await createLessonWithQuestions();

    const response = await patchQuestion(lesson.id, questionnaire.id, contentFor("TRUE_FALSE", "api-updated"));
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      question: { id: string; correctOptionId: string; translations: { en: { prompt: string } } };
    };
    expect(body.question.id).toBe(questionnaire.id);
    expect(body.question.correctOptionId).toBe("b");
    expect(body.question.translations.en.prompt).toBe("English question api-updated");
  });

  it("rejects invalid creation input with a validation error", async () => {
    const { lesson } = await createLessonWithQuestions();
    const invalid = { ...createBody, translations: { ...createBody.translations } };
    invalid.translations.el = { ...invalid.translations.el, prompt: "   " };

    const response = await postQuestion(lesson.id, invalid);
    expect(response.status).toBe(422);
    expect(await prisma.question.count({ where: { lessonId: lesson.id } })).toBe(3);
  });

  it("rejects invalid update input with a validation error", async () => {
    const { lesson, questionnaire } = await createLessonWithQuestions();
    const invalid = contentFor("TRUE_FALSE", "api-blank");
    invalid.translations.en.explanation = "   ";

    const response = await patchQuestion(lesson.id, questionnaire.id, invalid);
    expect(response.status).toBe(422);
  });

  it("returns not found for an unknown question or lesson", async () => {
    const { lesson, questionnaire } = await createLessonWithQuestions();

    const missingQuestion = await patchQuestion(lesson.id, "missing-question", contentFor("TRUE_FALSE", "missing"));
    expect(missingQuestion.status).toBe(404);

    const missingLesson = await postQuestion("missing-lesson", createBody);
    expect(missingLesson.status).toBe(404);

    expect((await patchQuestion("missing-lesson", questionnaire.id, contentFor("TRUE_FALSE", "missing"))).status).toBe(404);
  });

  it("rejects a non-ready lesson with a conflict", async () => {
    const { lesson, questionnaire } = await createLessonWithQuestions("GENERATING");

    expect((await postQuestion(lesson.id, createBody)).status).toBe(409);
    expect((await patchQuestion(lesson.id, questionnaire.id, contentFor("TRUE_FALSE", "not-ready"))).status).toBe(409);
  });
});
