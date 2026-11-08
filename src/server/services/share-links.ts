import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/server/db";
import { AppError, ValidationError } from "@/lib/errors";

export const shareLinkInputSchema = z
  .object({
    classId: z.string().min(1).optional(),
    lessonId: z.string().min(1).optional(),
    expiresAt: z.string().datetime().optional().nullable(),
  })
  .refine((value) => Boolean(value.classId) !== Boolean(value.lessonId), {
    message: "Provide exactly one of classId or lessonId",
  });

export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newShareToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createShareLink(input: unknown, db: PrismaClient = defaultPrisma) {
  const parsed = shareLinkInputSchema.parse(input);
  if (parsed.classId) {
    const classroom = await db.class.findUnique({ where: { id: parsed.classId }, select: { id: true } });
    if (!classroom) throw new AppError("not_found", "Class not found", 404);
  }
  if (parsed.lessonId) {
    const lesson = await db.lesson.findUnique({ where: { id: parsed.lessonId }, select: { id: true } });
    if (!lesson) throw new AppError("not_found", "Lesson not found", 404);
  }

  const token = newShareToken();
  const link = await db.shareLink.create({
    data: {
      token,
      tokenHash: hashShareToken(token),
      classId: parsed.classId ?? null,
      lessonId: parsed.lessonId ?? null,
      expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null,
    },
  });

  return { link, token };
}

export async function listShareLinks(
  input: { classId?: string; lessonId?: string },
  db: PrismaClient = defaultPrisma,
) {
  if (!input.classId && !input.lessonId) {
    throw new ValidationError("Provide classId or lessonId");
  }
  return db.shareLink.findMany({
    where: {
      ...(input.classId ? { classId: input.classId } : {}),
      ...(input.lessonId ? { lessonId: input.lessonId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function revokeShareLink(id: string, db: PrismaClient = defaultPrisma) {
  const link = await db.shareLink.findUnique({ where: { id } });
  if (!link) throw new AppError("not_found", "Share link not found", 404);
  return db.shareLink.update({ where: { id }, data: { revokedAt: new Date() } });
}

export async function resolveShareToken(token: string, db: PrismaClient = defaultPrisma) {
  const link = await db.shareLink.findUnique({
    where: { tokenHash: hashShareToken(token) },
    include: {
      class: { include: { lessons: { where: { status: "READY" }, orderBy: { createdAt: "desc" } } } },
      lesson: { include: { class: true } },
    },
  });
  if (!link) throw new AppError("invalid_token", "This link is not valid", 404);
  if (link.revokedAt) throw new AppError("invalid_token", "This link has been revoked", 410);
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
    throw new AppError("expired_token", "This link has expired", 410);
  }
  await db.shareLink.update({ where: { id: link.id }, data: { lastAccessedAt: new Date() } });
  return link;
}
