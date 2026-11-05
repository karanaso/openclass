import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { startTestInfra, type TestInfra } from "./helpers/infra";
import { resetEnvCache } from "@/lib/env";

let infra: TestInfra;
let prisma: PrismaClient;
let results: typeof import("@/server/services/results");
let storageRoot: string;

beforeAll(async () => {
  infra = await startTestInfra();
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "lessonlab-results-"));
  process.env.DATABASE_URL = infra.databaseUrl;
  process.env.AUTH_SECRET = "a".repeat(40);
  process.env.TEACHER_PASSWORD = "test";
  process.env.AI_PROVIDER = "mock";
  process.env.TTS_PROVIDER = "mock";
  process.env.STORAGE_ROOT = storageRoot;
  resetEnvCache();
  prisma = (await import("@/server/db")).prisma;
  results = await import("@/server/services/results");
}, 120_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await rm(storageRoot, { recursive: true, force: true });
  await infra?.stop();
});

async function seed() {
  const classroom = await prisma.class.create({ data: { name: "Class Results" } });
  const lessonA = await prisma.lesson.create({
    data: {
      classId: classroom.id,
      title: "Lesson A",
      originalFilename: "a.pdf",
      storageKey: "lessons/a/original.pdf",
      checksum: `a-${Math.random()}`,
      sizeBytes: 1,
      pageCount: 1,
      status: "READY",
      sourceLocale: "en",
    },
  });
  const lessonB = await prisma.lesson.create({
    data: {
      classId: classroom.id,
      title: "Lesson B",
      originalFilename: "b.pdf",
      storageKey: "lessons/b/original.pdf",
      checksum: `b-${Math.random()}`,
      sizeBytes: 1,
      pageCount: 1,
      status: "READY",
      sourceLocale: "en",
    },
  });

  const questions = [];
  for (const [index, correctOptionId] of ["a", "b"].entries()) {
    questions.push(
      await prisma.question.create({
        data: {
          lessonId: lessonA.id,
          mode: "QUESTIONNAIRE",
          itemKey: `q-${index + 1}`,
          position: index,
          type: "MULTIPLE_CHOICE",
          correctOptionId,
          sourcePage: 1,
          translations: {
            create: [
              {
                locale: "en",
                prompt: `Question ${index + 1}`,
                options: ["a", "b", "c", "d"].map((id) => ({ id, text: `Option ${id}` })),
                explanation: "Because",
              },
            ],
          },
        },
      }),
    );
  }

  const createAttempt = (
    lessonId: string,
    name: string,
    normalizedName: string,
    percentage: number,
    passed: boolean,
    answers: Array<{ questionId: string; selectedOptionId: string; isCorrect: boolean }>,
  ) =>
    prisma.attempt.create({
      data: {
        lessonId,
        studentName: name,
        normalizedStudentName: normalizedName,
        mode: "QUESTIONNAIRE",
        locale: "en",
        score: answers.filter((answer) => answer.isCorrect).length,
        maxScore: answers.length,
        percentage,
        passed,
        durationMs: 60_000,
        completedAt: new Date(),
        answers: { create: answers },
      },
    });

  await createAttempt(lessonA.id, 'Maria "M", Test', "maria", 100, true, [
    { questionId: questions[0].id, selectedOptionId: "a", isCorrect: true },
    { questionId: questions[1].id, selectedOptionId: "b", isCorrect: true },
  ]);
  await createAttempt(lessonA.id, "Nikos", "nikos", 50, false, [
    { questionId: questions[0].id, selectedOptionId: "a", isCorrect: true },
    { questionId: questions[1].id, selectedOptionId: "a", isCorrect: false },
  ]);
  await createAttempt(lessonA.id, "Eleni", "eleni", 0, false, [
    { questionId: questions[0].id, selectedOptionId: "c", isCorrect: false },
    { questionId: questions[1].id, selectedOptionId: "a", isCorrect: false },
  ]);
  await createAttempt(lessonB.id, "Maria", "maria", 70, true, []);

  await prisma.deckView.create({ data: { lessonId: lessonA.id, normalizedStudentName: "maria" } });

  return { classroom, lessonA, lessonB };
}

describe("results analytics", () => {
  it("computes lesson statistics and sorts weak questions first", async () => {
    const { lessonA } = await seed();
    const report = await results.getLessonResults(lessonA.id);

    expect(report.stats.count).toBe(3);
    expect(report.stats.average).toBe(50);
    expect(report.stats.median).toBe(50);
    expect(report.stats.passRate).toBe(33);
    expect(report.deckViews).toBe(1);
    expect(report.questions).toHaveLength(2);
    expect(report.questions[0].prompt).toBe("Question 2");
    expect(report.questions[0].correctRate).toBe(33);
    expect(report.questions[1].correctRate).toBe(67);
    expect(report.questions[0].options.find((option) => option.id === "a")?.count).toBe(2);
  });

  it("computes class summaries and per-student averages", async () => {
    const { classroom } = await seed();
    const report = await results.getClassResults(classroom.id);
    expect(report.stats.attempts).toBe(4);
    expect(report.stats.students).toBe(3);
    expect(report.stats.average).toBe(45);
    expect(report.lessons.find((lesson) => lesson.title === "Lesson A")?.average).toBe(50);
    expect(report.lessons.find((lesson) => lesson.title === "Lesson B")?.average).toBe(70);
    expect(report.students.find((student) => student.normalizedName === "maria")?.average).toBe(85);
    expect(report.students.find((student) => student.normalizedName === "maria")?.lessons).toBe(2);
  });

  it("exports lesson and class CSVs with escaping", async () => {
    const { classroom, lessonA } = await seed();
    const lessonCsv = await results.exportLessonCsv(lessonA.id);
    expect(lessonCsv.split("\r\n")[0]).toContain("student");
    expect(lessonCsv).toContain('"Maria ""M"", Test"');
    expect(lessonCsv.split("\r\n")).toHaveLength(4);

    const classCsv = await results.exportClassCsv(classroom.id);
    expect(classCsv).toContain("Class Results");
    expect(classCsv.split("\r\n")).toHaveLength(5);
  });

  it("deletes attempts and updates statistics", async () => {
    const { lessonA } = await seed();
    const before = await results.getLessonResults(lessonA.id);
    const target = before.attempts.find((attempt) => attempt.percentage === 0)!;
    await results.deleteAttempt(target.id);
    const after = await results.getLessonResults(lessonA.id);
    expect(after.stats.count).toBe(2);
    expect(after.attempts.some((attempt) => attempt.id === target.id)).toBe(false);
  });

  it("scopes an attempt to its own student", async () => {
    const { lessonA } = await seed();
    const attempt = await prisma.attempt.findFirstOrThrow({ where: { lessonId: lessonA.id, normalizedStudentName: "maria" } });
    await expect(results.getAttemptForStudent(lessonA.id, attempt.id, "maria")).resolves.toBeTruthy();
    await expect(results.getAttemptForStudent(lessonA.id, attempt.id, "nikos")).rejects.toMatchObject({ code: "not_found" });
  });
});
