import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { startTestInfra, type TestInfra } from "./helpers/infra";
import { resetEnvCache } from "@/lib/env";
import { resetStorage } from "@/server/storage";

let infra: TestInfra;
let prisma: PrismaClient;
let storageRoot: string;
let share: typeof import("@/server/services/share-links");
let questionnaire: typeof import("@/server/student/questionnaire");
let game: typeof import("@/server/student/game");
let lessonData: typeof import("@/server/student/lesson-data");
let session: typeof import("@/server/auth/student");
let queueModule: typeof import("@/server/queue");

beforeAll(async () => {
  infra = await startTestInfra();
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "lessonlab-student-"));
  process.env.DATABASE_URL = infra.databaseUrl;
  process.env.REDIS_URL = infra.redisUrl;
  process.env.AUTH_SECRET = "a".repeat(40);
  process.env.TEACHER_PASSWORD = "test";
  process.env.AI_PROVIDER = "mock";
  process.env.TTS_PROVIDER = "mock";
  process.env.STORAGE_ROOT = storageRoot;
  resetEnvCache();
  resetStorage();

  const redis = await import("@/server/redis");
  await redis.closeRedis();
  queueModule = await import("@/server/queue");
  await queueModule.closeLessonQueue();
  prisma = (await import("@/server/db")).prisma;
  share = await import("@/server/services/share-links");
  questionnaire = await import("@/server/student/questionnaire");
  game = await import("@/server/student/game");
  lessonData = await import("@/server/student/lesson-data");
  session = await import("@/server/auth/student");
}, 120_000);

afterAll(async () => {
  await queueModule?.closeLessonQueue();
  const redis = await import("@/server/redis");
  await redis.closeRedis();
  await prisma?.$disconnect();
  await rm(storageRoot, { recursive: true, force: true });
  await infra?.stop();
});

async function createLessonFixture(options: { includeEnglish?: boolean } = {}) {
  const includeEnglish = options.includeEnglish ?? true;
  const classroom = await prisma.class.create({ data: { name: `Student ${Math.random()}` } });
  const lesson = await prisma.lesson.create({
    data: {
      classId: classroom.id,
      title: "Photosynthesis",
      originalFilename: "photosynthesis.pdf",
      storageKey: "lessons/test/original.pdf",
      checksum: `student-${Math.random()}`,
      sizeBytes: 100,
      pageCount: 2,
      sourceLocale: "el",
      status: "READY",
      passThreshold: 60,
    },
  });

  for (let index = 0; index < 2; index += 1) {
    await prisma.card.create({
      data: {
        lessonId: lesson.id,
        itemKey: `card-${index + 1}`,
        position: index,
        sourcePage: index + 1,
        translations: {
          create: [
            { locale: "el", prompt: `Κάρτα ${index + 1}`, answer: `Απάντηση ${index + 1}` },
            ...(includeEnglish ? [{ locale: "en", prompt: `Card ${index + 1}`, answer: `Answer ${index + 1}` }] : []),
          ],
        },
      },
    });
  }

  for (const mode of ["QUESTIONNAIRE", "GAME"] as const) {
    const count = mode === "QUESTIONNAIRE" ? 3 : 2;
    for (let index = 0; index < count; index += 1) {
      const options = ["a", "b", "c", "d"].map((id) => ({ id, text: `${mode} option ${id} ${index}` }));
      await prisma.question.create({
        data: {
          lessonId: lesson.id,
          mode,
          itemKey: `${mode}-${index + 1}`,
          position: index,
          type: "MULTIPLE_CHOICE",
          correctOptionId: "a",
          sourcePage: 1,
          translations: {
            create: [
              {
                locale: "el",
                prompt: `Ερώτηση ${mode} ${index + 1}`,
                options,
                explanation: `Εξήγηση ${index + 1}`,
              },
              ...(includeEnglish
                ? [
                    {
                      locale: "en",
                      prompt: `Question ${mode} ${index + 1}`,
                      options,
                      explanation: `Explanation ${index + 1}`,
                    },
                  ]
                : []),
            ],
          },
        },
      });
    }
  }

  return { classroom, lesson };
}

describe("share links", () => {
  it("creates hashed tokens that resolve by raw token", async () => {
    const { lesson } = await createLessonFixture();
    const created = await share.createShareLink({ lessonId: lesson.id });
    expect(created.token).toHaveLength(43);
    const stored = await prisma.shareLink.findUniqueOrThrow({ where: { id: created.link.id } });
    expect(stored.tokenHash).not.toBe(created.token);
    const resolved = await share.resolveShareToken(created.token);
    expect(resolved.lessonId).toBe(lesson.id);
  });

  it("denies revoked and expired links", async () => {
    const { lesson } = await createLessonFixture();
    const created = await share.createShareLink({ lessonId: lesson.id });
    await share.revokeShareLink(created.link.id);
    await expect(share.resolveShareToken(created.token)).rejects.toMatchObject({ code: "invalid_token" });

    const expired = await share.createShareLink({
      lessonId: lesson.id,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    await expect(share.resolveShareToken(expired.token)).rejects.toMatchObject({ code: "expired_token" });
  });

  it("scopes class links to the class's ready lessons", async () => {
    const { classroom, lesson } = await createLessonFixture();
    const created = await share.createShareLink({ classId: classroom.id });
    const resolved = await share.resolveShareToken(created.token);
    expect(resolved.class?.lessons.map((item) => item.id)).toContain(lesson.id);
  });
});

describe("student session", () => {
  it("round-trips and rejects tampered sessions", async () => {
    const token = await session.createStudentSessionToken({
      name: "Maria",
      normalizedName: "maria",
      tokenHash: share.hashShareToken("abc"),
    });
    const parsed = await session.verifyStudentSessionToken(token);
    expect(parsed?.name).toBe("Maria");
    expect(await session.verifyStudentSessionToken(`${token}x`)).toBeNull();
  });
});

describe("questionnaire grading", () => {
  it("grades answers, returns feedback, and blocks a second attempt", async () => {
    const { lesson } = await createLessonFixture();
    const questions = await prisma.question.findMany({ where: { lessonId: lesson.id, mode: "QUESTIONNAIRE" }, orderBy: { position: "asc" } });
    const result = await questionnaire.submitQuestionnaire({
      lessonId: lesson.id,
      studentName: "Maria",
      normalizedStudentName: "maria",
      locale: "en",
      answers: questions.map((question) => ({ questionId: question.id, optionId: "a" })),
      durationMs: 5000,
      idempotencyKey: "submit-1",
      retakeEnabled: false,
      passThreshold: 60,
    });
    expect(result.blocked).toBe(false);
    expect(result.result.score).toBe(3);
    expect(result.result.percentage).toBe(100);
    expect(result.result.feedback).toHaveLength(3);

    const duplicate = await questionnaire.submitQuestionnaire({
      lessonId: lesson.id,
      studentName: "Maria",
      normalizedStudentName: "maria",
      locale: "en",
      answers: [],
      durationMs: 1,
      idempotencyKey: "submit-2",
      retakeEnabled: false,
      passThreshold: 60,
    });
    expect(duplicate.blocked).toBe(true);
    expect(duplicate.result.score).toBe(3);
  });

  it("allows retakes with a new attempt and keeps idempotent submissions", async () => {
    const { lesson } = await createLessonFixture();
    const questions = await prisma.question.findMany({ where: { lessonId: lesson.id, mode: "QUESTIONNAIRE" }, orderBy: { position: "asc" } });
    const first = await questionnaire.submitQuestionnaire({
      lessonId: lesson.id,
      studentName: "Nikos",
      normalizedStudentName: "nikos",
      locale: "el",
      answers: [{ questionId: questions[0].id, optionId: "a" }],
      durationMs: 1000,
      idempotencyKey: "retake-1",
      retakeEnabled: true,
      passThreshold: 60,
    });
    expect(first.result.score).toBe(1);
    expect(first.result.percentage).toBe(33);

    const same = await questionnaire.submitQuestionnaire({
      lessonId: lesson.id,
      studentName: "Nikos",
      normalizedStudentName: "nikos",
      locale: "el",
      answers: [{ questionId: questions[0].id, optionId: "b" }],
      durationMs: 1000,
      idempotencyKey: "retake-1",
      retakeEnabled: true,
      passThreshold: 60,
    });
    expect(same.result.attemptId).toBe(first.result.attemptId);

    const newAttempt = await questionnaire.submitQuestionnaire({
      lessonId: lesson.id,
      studentName: "Nikos",
      normalizedStudentName: "nikos",
      locale: "el",
      answers: questions.map((question) => ({ questionId: question.id, optionId: "a" })),
      durationMs: 1000,
      idempotencyKey: "retake-2",
      retakeEnabled: true,
      passThreshold: 60,
    });
    expect(newAttempt.result.attemptId).not.toBe(first.result.attemptId);
  });
});

describe("millionaire game", () => {
  it("never exposes answer keys in active state and supports lifelines, resume, and review", async () => {
    const { lesson } = await createLessonFixture();
    const started = await game.startGame({
      lessonId: lesson.id,
      studentName: "Maria",
      normalizedStudentName: "maria",
      locale: "en",
    });
    expect(started.status).toBe("ACTIVE");
    const activeJson = JSON.stringify(started);
    expect(activeJson).not.toContain("correctOptionId");
    expect(activeJson).not.toContain("explanation");
    const firstQuestion = (started as Extract<typeof started, { status: "ACTIVE" }>).question!;

    const resumed = await game.startGame({
      lessonId: lesson.id,
      studentName: "Maria",
      normalizedStudentName: "maria",
      locale: "en",
    });
    expect(resumed.attemptId).toBe(started.attemptId);

    const lifeline = await game.consumeLifeline({
      attemptId: started.attemptId,
      lessonId: lesson.id,
      normalizedStudentName: "maria",
      lifeline: "fiftyFifty",
      locale: "en",
    });
    expect(lifeline.removedOptionIds?.length).toBe(2);
    await expect(
      game.consumeLifeline({
        attemptId: started.attemptId,
        lessonId: lesson.id,
        normalizedStudentName: "maria",
        lifeline: "fiftyFifty",
        locale: "en",
      }),
    ).rejects.toMatchObject({ code: "lifeline_used" });

    const correct = await game.answerGame({
      attemptId: started.attemptId,
      lessonId: lesson.id,
      normalizedStudentName: "maria",
      questionId: firstQuestion.id,
      optionId: "a",
      locale: "en",
    });
    expect(correct.result.isCorrect).toBe(true);
    expect(correct.state.status).toBe("ACTIVE");
    expect(correct.state.score).toBe(1);

    const second = (correct.state as Extract<typeof correct.state, { status: "ACTIVE" }>).question!;
    const wrong = await game.answerGame({
      attemptId: started.attemptId,
      lessonId: lesson.id,
      normalizedStudentName: "maria",
      questionId: second.id,
      optionId: "b",
      locale: "en",
    });
    expect(wrong.state.status).toBe("ENDED");
    if (wrong.state.status === "ENDED") {
      expect(wrong.state.score).toBe(1);
      expect(wrong.state.review).toHaveLength(2);
      expect(wrong.state.review[1].correctOptionId).toBe("a");
    }
  });

  it("expires an abandoned session and starts a new one", async () => {
    const { lesson } = await createLessonFixture();
    const started = await game.startGame({
      lessonId: lesson.id,
      studentName: "Eleni",
      normalizedStudentName: "eleni",
      locale: "el",
    });
    await prisma.attempt.update({
      where: { id: started.attemptId },
      data: { lastActivityAt: new Date(Date.now() - 5 * 60 * 60 * 1000) },
    });
    const restarted = await game.startGame({
      lessonId: lesson.id,
      studentName: "Eleni",
      normalizedStudentName: "eleni",
      locale: "el",
    });
    expect(restarted.attemptId).not.toBe(started.attemptId);
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: started.attemptId } })).gameStatus).toBe("ENDED");
  });
});

describe("student content", () => {
  it("does not expose questionnaire answer keys and falls back to the primary locale", async () => {
    const { lesson } = await createLessonFixture({ includeEnglish: false });
    const data = await lessonData.loadLessonForStudent({
      lessonId: lesson.id,
      locale: "en",
      token: "test-token",
      normalizedStudentName: "maria",
    });
    expect(data?.fallbackUsed).toBe(true);
    expect(data?.questionnaire[0].prompt).toContain("Ερώτηση");
    expect(JSON.stringify(data?.questionnaire)).not.toContain("correctOptionId");
    expect(JSON.stringify(data?.questionnaire)).not.toContain("explanation");
  });
});
