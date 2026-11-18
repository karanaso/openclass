import { createHash } from "node:crypto";
import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "@/server/db";
import { AppError, NotFoundError } from "@/lib/errors";
import {
  MAX_RESOURCES_PER_LESSON,
  RESOURCE_DESCRIPTION_MAX,
  RESOURCE_TITLE_MAX,
  RESOURCE_URL_MAX,
  parseResourceUrl,
  resourceTitleFromUrl,
  type ResourceKind,
} from "@/lib/resources";

const titleSchema = z
  .string()
  .trim()
  .min(1, "A title is required")
  .max(RESOURCE_TITLE_MAX, `The title must be ${RESOURCE_TITLE_MAX} characters or fewer`);

const descriptionSchema = z
  .string()
  .trim()
  .max(RESOURCE_DESCRIPTION_MAX, `The description must be ${RESOURCE_DESCRIPTION_MAX} characters or fewer`)
  .nullable()
  .optional();

const urlSchema = z
  .string()
  .trim()
  .min(1, "A URL is required")
  .max(RESOURCE_URL_MAX, `The URL must be ${RESOURCE_URL_MAX} characters or fewer`);

const sourcePageSchema = z.number().int().positive().nullable().optional();

export const resourceCreateSchema = z.object({
  title: titleSchema,
  description: descriptionSchema,
  url: urlSchema,
  sourcePage: sourcePageSchema,
});

export const resourceUpdateSchema = z
  .object({
    title: titleSchema.optional(),
    description: descriptionSchema,
    url: urlSchema.optional(),
    status: z.enum(["APPROVED", "DISMISSED"]).optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    { message: "Provide at least one field to update" },
  );

export type ResourceCandidate = {
  url: string;
  title?: string | null;
  source: "TEXT" | "ANNOTATION" | "QR";
  sourcePage?: number | null;
};

export type LessonResourceView = {
  id: string;
  kind: ResourceKind;
  status: "SUGGESTED" | "APPROVED" | "DISMISSED";
  source: "MANUAL" | "TEXT" | "ANNOTATION" | "QR";
  sourcePage: number | null;
  title: string;
  description: string | null;
  url: string;
  youtubeId: string | null;
  position: number;
  createdAt: string;
};

type ResourceRecord = {
  id: string;
  kind: "LINK" | "YOUTUBE";
  status: "SUGGESTED" | "APPROVED" | "DISMISSED";
  source: "MANUAL" | "TEXT" | "ANNOTATION" | "QR";
  sourcePage: number | null;
  title: string;
  description: string | null;
  url: string;
  youtubeId: string | null;
  position: number;
  createdAt: Date;
};

function fingerprintFor(fingerprintInput: string): string {
  return createHash("sha256").update(fingerprintInput).digest("hex");
}

function normalizedUrlOrThrow(value: string) {
  const result = parseResourceUrl(value);
  if (!result.ok) throw new AppError("invalid_url", result.message, 422);
  return result.value;
}

function toView(resource: ResourceRecord): LessonResourceView {
  return {
    id: resource.id,
    kind: resource.kind,
    status: resource.status,
    source: resource.source,
    sourcePage: resource.sourcePage,
    title: resource.title,
    description: resource.description,
    url: resource.url,
    youtubeId: resource.youtubeId,
    position: resource.position,
    createdAt: resource.createdAt.toISOString(),
  };
}

async function assertLessonExists(
  lessonId: string,
  db: PrismaClient | Prisma.TransactionClient,
): Promise<void> {
  const lesson = await db.lesson.findUnique({ where: { id: lessonId }, select: { id: true } });
  if (!lesson) throw new NotFoundError("Lesson not found");
}

export async function listLessonResources(
  lessonId: string,
  db: PrismaClient = defaultPrisma,
): Promise<LessonResourceView[]> {
  await assertLessonExists(lessonId, db);
  const resources = await db.lessonResource.findMany({
    where: { lessonId, status: { not: "DISMISSED" } },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  return resources.map(toView);
}

export async function createManualResource(
  lessonId: string,
  input: unknown,
  db: PrismaClient = defaultPrisma,
): Promise<LessonResourceView> {
  const parsed = resourceCreateSchema.parse(input);
  const normalized = normalizedUrlOrThrow(parsed.url);
  const fingerprint = fingerprintFor(normalized.fingerprintInput);

  return db.$transaction(async (tx) => {
    await assertLessonExists(lessonId, tx);

    const duplicate = await tx.lessonResource.findUnique({
      where: { lessonId_fingerprint: { lessonId, fingerprint } },
      select: { id: true },
    });
    if (duplicate) {
      throw new AppError("duplicate_resource", "This resource already exists for the lesson", 409);
    }

    const aggregate = await tx.lessonResource.aggregate({
      where: { lessonId },
      _max: { position: true },
    });

    const created = await tx.lessonResource.create({
      data: {
        lessonId,
        kind: normalized.kind,
        status: "APPROVED",
        source: "MANUAL",
        sourcePage: parsed.sourcePage ?? null,
        title: parsed.title,
        description: parsed.description?.trim() || null,
        url: normalized.url,
        youtubeId: normalized.youtubeId,
        fingerprint,
        position: (aggregate._max.position ?? 0) + 1,
      },
    });

    return toView(created);
  });
}

export async function updateResource(
  lessonId: string,
  resourceId: string,
  input: unknown,
  db: PrismaClient = defaultPrisma,
): Promise<LessonResourceView> {
  const parsed = resourceUpdateSchema.parse(input);

  return db.$transaction(async (tx) => {
    const existing = await tx.lessonResource.findFirst({
      where: { id: resourceId, lessonId },
    });
    if (!existing) throw new NotFoundError("Resource not found");

    const data: {
      title?: string;
      description?: string | null;
      url?: string;
      kind?: "LINK" | "YOUTUBE";
      youtubeId?: string | null;
      fingerprint?: string;
      status?: "APPROVED" | "DISMISSED";
    } = {};

    if (parsed.title !== undefined) data.title = parsed.title;
    if (Object.prototype.hasOwnProperty.call(parsed, "description")) {
      data.description = parsed.description?.trim() || null;
    }

    if (parsed.url !== undefined) {
      const normalized = normalizedUrlOrThrow(parsed.url);
      const fingerprint = fingerprintFor(normalized.fingerprintInput);
      const duplicate = await tx.lessonResource.findFirst({
        where: { lessonId, fingerprint, NOT: { id: resourceId } },
        select: { id: true },
      });
      if (duplicate) {
        throw new AppError("duplicate_resource", "This resource already exists for the lesson", 409);
      }
      data.url = normalized.url;
      data.kind = normalized.kind;
      data.youtubeId = normalized.youtubeId;
      data.fingerprint = fingerprint;
    }

    if (parsed.status !== undefined) {
      const transitionAllowed =
        existing.status === "SUGGESTED" || existing.status === parsed.status;
      if (!transitionAllowed) {
        throw new AppError(
          "invalid_status",
          "Only suggested resources can be approved or dismissed",
          409,
        );
      }
      data.status = parsed.status;
    }

    const updated = await tx.lessonResource.update({ where: { id: resourceId }, data });
    return toView(updated);
  });
}

export async function deleteResource(
  lessonId: string,
  resourceId: string,
  db: PrismaClient = defaultPrisma,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const existing = await tx.lessonResource.findFirst({
      where: { id: resourceId, lessonId },
      select: { id: true, status: true },
    });
    if (!existing) throw new NotFoundError("Resource not found");
    if (existing.status !== "APPROVED") {
      throw new AppError(
        "invalid_status",
        "Dismiss suggested resources instead of deleting them",
        409,
      );
    }
    await tx.lessonResource.delete({ where: { id: resourceId } });
  });
}

export async function createSuggestedResources(
  lessonId: string,
  candidates: ResourceCandidate[],
  db: PrismaClient = defaultPrisma,
): Promise<{ created: number }> {
  if (candidates.length === 0) return { created: 0 };

  return db.$transaction(async (tx) => {
    await assertLessonExists(lessonId, tx);

    const existingCount = await tx.lessonResource.count({ where: { lessonId } });
    const remaining = Math.max(0, MAX_RESOURCES_PER_LESSON - existingCount);
    if (remaining === 0) return { created: 0 };

    const seen = new Set<string>();
    const rows: Array<{
      lessonId: string;
      kind: "LINK" | "YOUTUBE";
      status: "SUGGESTED";
      source: "TEXT" | "ANNOTATION" | "QR";
      sourcePage: number | null;
      title: string;
      url: string;
      youtubeId: string | null;
      fingerprint: string;
      position: number;
    }> = [];

    for (const candidate of candidates) {
      if (rows.length >= remaining) break;
      const normalized = parseResourceUrl(candidate.url);
      if (!normalized.ok) continue;
      const fingerprint = fingerprintFor(normalized.value.fingerprintInput);
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);

      const title = candidate.title?.trim();
      rows.push({
        lessonId,
        kind: normalized.value.kind,
        status: "SUGGESTED",
        source: candidate.source,
        sourcePage: candidate.sourcePage ?? null,
        title:
          (title ? title.slice(0, RESOURCE_TITLE_MAX) : "") ||
          resourceTitleFromUrl(normalized.value.url, normalized.value.kind),
        url: normalized.value.url,
        youtubeId: normalized.value.youtubeId,
        fingerprint,
        position: 0,
      });
    }

    if (rows.length === 0) return { created: 0 };

    const aggregate = await tx.lessonResource.aggregate({
      where: { lessonId },
      _max: { position: true },
    });
    const start = (aggregate._max.position ?? 0) + 1;

    const result = await tx.lessonResource.createMany({
      data: rows.map((row, index) => ({ ...row, position: start + index })),
      skipDuplicates: true,
    });

    return { created: result.count };
  });
}
