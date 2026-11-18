import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/server/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import {
  normalizeGeneratedRubric,
  parseLessonRubric,
  rubricUpdateSchema,
  type LessonRubric,
} from "@/lib/rubric";

export async function getLessonRubric(
  lessonId: string,
  db: PrismaClient = defaultPrisma,
): Promise<LessonRubric | null> {
  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    select: { rubric: true },
  });
  if (!lesson) throw new NotFoundError("Lesson not found");
  return parseLessonRubric(lesson.rubric);
}

export async function updateLessonRubric(
  lessonId: string,
  input: unknown,
  db: PrismaClient = defaultPrisma,
): Promise<LessonRubric | null> {
  const parsed = rubricUpdateSchema.parse(input);
  const lesson = await db.lesson.findUnique({ where: { id: lessonId }, select: { id: true } });
  if (!lesson) throw new NotFoundError("Lesson not found");

  const empty = parsed.criteria.length === 0 && parsed.levels.length === 0;
  const rubric = empty ? null : normalizeGeneratedRubric(parsed);
  if (!empty && !rubric) {
    throw new ValidationError("The rubric could not be saved");
  }

  await db.lesson.update({
    where: { id: lessonId },
    data: { rubric: rubric ?? Prisma.DbNull, rubricEdited: true },
  });
  return rubric;
}
