import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/server/db";
import { getStorage, type LocalStorage } from "@/server/storage";
import { NotFoundError, ValidationError } from "@/lib/errors";

export const classInputSchema = z.object({
  name: z.string().trim().min(1, "Class name is required").max(120),
  description: z.string().trim().max(500).optional().nullable(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex value")
    .optional()
    .default("#2563eb"),
});

export const classUpdateSchema = classInputSchema.partial();

export type ClassInput = z.infer<typeof classInputSchema>;

export async function listClasses(db: PrismaClient = defaultPrisma) {
  return db.class.findMany({
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { lessons: true } } },
  });
}

export async function createClass(input: unknown, db: PrismaClient = defaultPrisma) {
  const parsed = classInputSchema.parse(input);
  const aggregate = await db.class.aggregate({ _max: { position: true } });
  return db.class.create({
    data: {
      name: parsed.name,
      description: parsed.description || null,
      color: parsed.color,
      position: (aggregate._max.position ?? -1) + 1,
    },
  });
}

export async function updateClass(id: string, input: unknown, db: PrismaClient = defaultPrisma) {
  const parsed = classUpdateSchema.parse(input);
  const existing = await db.class.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Class not found");
  return db.class.update({
    where: { id },
    data: {
      ...(parsed.name !== undefined ? { name: parsed.name } : {}),
      ...(parsed.description !== undefined ? { description: parsed.description || null } : {}),
      ...(parsed.color !== undefined ? { color: parsed.color } : {}),
    },
  });
}

export async function reorderClasses(ids: string[], db: PrismaClient = defaultPrisma) {
  if (!Array.isArray(ids) || ids.length === 0 || new Set(ids).size !== ids.length) {
    throw new ValidationError("Order must contain unique class ids");
  }
  const classes = await db.class.findMany({ select: { id: true } });
  const existing = new Set(classes.map((item) => item.id));
  if (ids.length !== classes.length || ids.some((id) => !existing.has(id))) {
    throw new ValidationError("Order must include every class exactly once");
  }
  await db.$transaction(ids.map((id, position) => db.class.update({ where: { id }, data: { position } })));
  return listClasses(db);
}

export async function deleteClass(
  id: string,
  db: PrismaClient = defaultPrisma,
  storage: LocalStorage = getStorage(),
) {
  const existing = await db.class.findUnique({
    where: { id },
    include: { lessons: { select: { id: true } } },
  });
  if (!existing) throw new NotFoundError("Class not found");

  await db.$transaction(async (tx) => {
    await tx.class.delete({ where: { id } });
  });

  for (const lesson of existing.lessons) {
    await storage.deletePrefix(`lessons/${lesson.id}`);
  }

  return { deletedLessonIds: existing.lessons.map((lesson) => lesson.id) };
}

export async function getClassWithLessons(id: string, db: PrismaClient = defaultPrisma) {
  const classroom = await db.class.findUnique({
    where: { id },
    include: {
      lessons: {
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { attempts: true, cards: true, questions: true } },
          jobs: {
            select: { stage: true, status: true, inputTokens: true, outputTokens: true, estimatedCostUsd: true },
          },
        },
      },
    },
  });
  if (!classroom) throw new NotFoundError("Class not found");
  return classroom;
}

export async function getLessonDetail(id: string, db: PrismaClient = defaultPrisma) {
  const lesson = await db.lesson.findUnique({
    where: { id },
    include: {
      class: true,
      jobs: { orderBy: { createdAt: "asc" } },
      videos: true,
      shareLinks: true,
      pages: { select: { pageNumber: true }, orderBy: { pageNumber: "asc" } },
      _count: { select: { cards: true, questions: true, attempts: true, deckViews: true } },
    },
  });
  if (!lesson) throw new NotFoundError("Lesson not found");
  return lesson;
}

export async function listLessonsForClass(classId: string, db: PrismaClient = defaultPrisma) {
  const classroom = await db.class.findUnique({ where: { id: classId }, select: { id: true } });
  if (!classroom) throw new NotFoundError("Class not found");
  return db.lesson.findMany({
    where: { classId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { attempts: true } } },
  });
}
