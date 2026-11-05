import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../db";
import type { GeneratedArtifacts, GeneratedQuestion } from "../generation/types";

function questionRows(lessonId: string, mode: "QUESTIONNAIRE" | "GAME", questions: GeneratedQuestion[]) {
  return questions.map((question) => ({
    lessonId,
    mode,
    itemKey: question.itemKey,
    position: question.position,
    type: question.type,
    correctOptionId: question.correctOptionId,
    sourcePage: question.sourcePage,
    translations: {
      create: (["el", "en"] as const).map((locale) => ({
        locale,
        prompt: question.prompt[locale],
        options: question.options[locale],
        explanation: question.explanation[locale],
      })),
    },
  }));
}

export async function publishArtifacts(
  lessonId: string,
  artifacts: GeneratedArtifacts,
  db: PrismaClient = defaultPrisma,
) {
  return db.$transaction(async (tx) => {
    await tx.card.deleteMany({ where: { lessonId } });
    await tx.question.deleteMany({ where: { lessonId } });
    await tx.narrationSegment.deleteMany({ where: { lessonId } });

    for (const card of artifacts.cards) {
      await tx.card.create({
        data: {
          lessonId,
          itemKey: card.itemKey,
          position: card.position,
          sourcePage: card.sourcePage,
          translations: {
            create: (["el", "en"] as const).map((locale) => ({
              locale,
              prompt: card.prompt[locale],
              answer: card.answer[locale],
            })),
          },
        },
      });
    }

    for (const question of questionRows(lessonId, "QUESTIONNAIRE", artifacts.questionnaire)) {
      await tx.question.create({ data: question });
    }
    for (const question of questionRows(lessonId, "GAME", artifacts.game)) {
      await tx.question.create({ data: question });
    }

    for (const segment of artifacts.narration) {
      for (const locale of ["el", "en"] as const) {
        await tx.narrationSegment.create({
          data: {
            lessonId,
            pageNumber: segment.pageNumber,
            locale,
            script: segment.script[locale],
          },
        });
      }
    }

    return tx.lesson.update({ where: { id: lessonId }, data: { status: "READY", readyAt: new Date(), failureReason: null } });
  });
}
