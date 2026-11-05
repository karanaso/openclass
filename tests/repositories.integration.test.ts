import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestInfra, type TestInfra } from "./helpers/infra";
import { setLessonStatus } from "@/server/repositories/lesson-status";
import { publishArtifacts } from "@/server/repositories/publication";
import { createAttempt } from "@/server/repositories/attempts";
import type { GeneratedArtifacts } from "@/server/generation/types";

let infra: TestInfra;

const artifacts: GeneratedArtifacts = {
  cards: [
    {
      itemKey: "card-1",
      position: 0,
      sourcePage: 1,
      prompt: { el: "Ερώτηση", en: "Question" },
      answer: { el: "Απάντηση", en: "Answer" },
    },
  ],
  questionnaire: [
    {
      itemKey: "q-1",
      position: 0,
      type: "MULTIPLE_CHOICE",
      correctOptionId: "a",
      sourcePage: 1,
      prompt: { el: "Ποιο;", en: "Which?" },
      options: {
        el: [
          { id: "a", text: "Α" },
          { id: "b", text: "Β" },
          { id: "c", text: "Γ" },
          { id: "d", text: "Δ" },
        ],
        en: [
          { id: "a", text: "A" },
          { id: "b", text: "B" },
          { id: "c", text: "C" },
          { id: "d", text: "D" },
        ],
      },
      explanation: { el: "Επειδή", en: "Because" },
    },
  ],
  game: [],
  narration: [{ pageNumber: 1, script: { el: "Αφήγηση", en: "Narration" } }],
};

beforeAll(async () => {
  infra = await startTestInfra();
}, 120_000);

afterAll(async () => {
  await infra?.stop();
});

async function createLesson() {
  const classroom = await infra.prisma.class.create({ data: { name: `Class ${Date.now()}` } });
  return infra.prisma.lesson.create({
    data: {
      classId: classroom.id,
      title: "Lesson",
      originalFilename: "lesson.pdf",
      storageKey: "lessons/test/original.pdf",
      checksum: `checksum-${Date.now()}`,
      sizeBytes: 100,
      pageCount: 1,
    },
  });
}

describe("repositories", () => {
  it("transitions lesson status", async () => {
    const lesson = await createLesson();
    await setLessonStatus(lesson.id, "EXTRACTING", {}, infra.prisma);
    const updated = await setLessonStatus(lesson.id, "READY", {}, infra.prisma);
    expect(updated.status).toBe("READY");
    expect(updated.readyAt).toBeTruthy();
  });

  it("publishes bilingual artifacts atomically", async () => {
    const lesson = await createLesson();
    const result = await publishArtifacts(lesson.id, artifacts, infra.prisma);
    expect(result.status).toBe("READY");
    expect(await infra.prisma.card.count({ where: { lessonId: lesson.id } })).toBe(1);
    expect(await infra.prisma.cardTranslation.count()).toBeGreaterThanOrEqual(2);
    expect(await infra.prisma.question.count({ where: { lessonId: lesson.id } })).toBe(1);
    expect(await infra.prisma.narrationSegment.count({ where: { lessonId: lesson.id } })).toBe(2);
  });

  it("rolls back a failed publication and preserves the previous version", async () => {
    const lesson = await createLesson();
    await publishArtifacts(lesson.id, artifacts, infra.prisma);

    const broken: GeneratedArtifacts = {
      ...artifacts,
      cards: [
        { ...artifacts.cards[0], itemKey: "duplicate-key" },
        { ...artifacts.cards[0], position: 1, itemKey: "duplicate-key" },
      ],
    };

    await expect(publishArtifacts(lesson.id, broken, infra.prisma)).rejects.toBeTruthy();
    expect(await infra.prisma.card.count({ where: { lessonId: lesson.id } })).toBe(1);
  });

  it("writes an attempt and is idempotent by key", async () => {
    const lesson = await createLesson();
    await publishArtifacts(lesson.id, artifacts, infra.prisma);
    const question = await infra.prisma.question.findFirstOrThrow({ where: { lessonId: lesson.id } });

    const input = {
      lessonId: lesson.id,
      studentName: "Maria",
      normalizedStudentName: "maria",
      mode: "QUESTIONNAIRE" as const,
      locale: "en",
      score: 1,
      maxScore: 1,
      percentage: 100,
      passed: true,
      durationMs: 1000,
      idempotencyKey: "idem-1",
      answers: [{ questionId: question.id, selectedOptionId: "a", isCorrect: true }],
    };

    const first = await createAttempt(input, infra.prisma);
    const second = await createAttempt(input, infra.prisma);
    expect(second.id).toBe(first.id);
    expect(await infra.prisma.attempt.count({ where: { lessonId: lesson.id } })).toBe(1);
  });

  it("rolls back an attempt when an answer is invalid", async () => {
    const lesson = await createLesson();
    await expect(
      createAttempt(
        {
          lessonId: lesson.id,
          studentName: "Nikos",
          normalizedStudentName: "nikos",
          mode: "QUESTIONNAIRE",
          locale: "el",
          score: 0,
          maxScore: 1,
          percentage: 0,
          passed: false,
          durationMs: 500,
          answers: [{ questionId: "missing", selectedOptionId: "a", isCorrect: false }],
        },
        infra.prisma,
      ),
    ).rejects.toBeTruthy();
    expect(await infra.prisma.attempt.count({ where: { lessonId: lesson.id } })).toBe(0);
  });
});
