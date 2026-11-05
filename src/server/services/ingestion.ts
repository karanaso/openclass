import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import type { PrismaClient } from "@prisma/client";
import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { prisma as defaultPrisma } from "@/server/db";
import { getPdfPageCount } from "@/server/pdf/extract";
import { enqueueStage } from "@/server/queue";
import { getStorage, randomStorageKey, type LocalStorage } from "@/server/storage";

export type UploadFileResult = {
  filename: string;
  status: "accepted" | "rejected" | "duplicate";
  lessonId?: string;
  reason?: string;
};

export type IngestOptions = {
  allowDuplicates?: boolean;
  db?: PrismaClient;
  storage?: LocalStorage;
};

const MAX_FILES = 50;

function titleFromFilename(filename: string): string {
  const base = path.basename(filename).replace(/\.pdf$/i, "").trim();
  return (base || "Untitled lesson").slice(0, 200);
}

async function validatePdf(file: File) {
  const env = getEnv();
  const filename = path.basename(file.name || "lesson.pdf");
  if (!/\.pdf$/i.test(filename)) {
    throw new AppError("invalid_file", "Only PDF files are accepted", 422);
  }
  if (file.size <= 0) {
    throw new AppError("invalid_file", "The file is empty", 422);
  }
  if (file.size > env.MAX_UPLOAD_BYTES) {
    throw new AppError(
      "file_too_large",
      `The file exceeds the ${Math.round(env.MAX_UPLOAD_BYTES / (1024 * 1024))} MB limit`,
      422,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const signature = Buffer.from(bytes.slice(0, 5)).toString("ascii");
  if (signature !== "%PDF-") {
    throw new AppError("invalid_file", "The file is not a valid PDF", 422);
  }

  const checksum = createHash("sha256").update(bytes).digest("hex");
  let pageCount: number;
  try {
    // unpdf may transfer the buffer to a worker, so validate against a copy.
    pageCount = await getPdfPageCount(bytes.slice());
  } catch {
    throw new AppError("invalid_pdf", "The PDF is corrupt or password-protected", 422);
  }

  if (pageCount < 1) {
    throw new AppError("invalid_pdf", "The PDF has no pages", 422);
  }
  if (pageCount > env.MAX_PDF_PAGES) {
    throw new AppError("too_many_pages", `The PDF exceeds the ${env.MAX_PDF_PAGES}-page limit`, 422);
  }

  return {
    filename,
    title: titleFromFilename(filename),
    bytes,
    pageCount,
    sizeBytes: bytes.byteLength,
    checksum,
  };
}

export async function ingestUploads(
  classId: string,
  files: File[],
  options: IngestOptions = {},
): Promise<UploadFileResult[]> {
  const db = options.db ?? defaultPrisma;
  const storage = options.storage ?? getStorage();
  const env = getEnv();

  const classroom = await db.class.findUnique({ where: { id: classId }, select: { id: true } });
  if (!classroom) {
    throw new AppError("not_found", "Class not found", 404);
  }
  if (files.length === 0) {
    throw new AppError("validation_error", "No files supplied", 422);
  }
  if (files.length > MAX_FILES) {
    throw new AppError("too_many_files", `Upload at most ${MAX_FILES} files at once`, 422);
  }

  const results: UploadFileResult[] = [];

  for (const file of files) {
    let validated: Awaited<ReturnType<typeof validatePdf>>;
    try {
      validated = await validatePdf(file);
    } catch (error) {
      results.push({
        filename: file.name || "file",
        status: "rejected",
        reason: error instanceof AppError ? error.message : "The file could not be read",
      });
      continue;
    }

    const duplicate = await db.lesson.findFirst({
      where: { classId, checksum: validated.checksum, status: { not: "CANCELLED" } },
      select: { id: true, title: true },
    });

    if (duplicate && !options.allowDuplicates) {
      results.push({
        filename: validated.filename,
        status: "duplicate",
        lessonId: duplicate.id,
        reason: "A file with the same content already exists in this class",
      });
      continue;
    }

    const lessonId = randomUUID();
    const storageKey = randomStorageKey(`lessons/${lessonId}`, "pdf");
    try {
      await storage.put(storageKey, validated.bytes);
      const lesson = await db.lesson.create({
        data: {
          id: lessonId,
          classId,
          title: validated.title,
          originalFilename: validated.filename,
          storageKey,
          checksum: validated.checksum,
          sizeBytes: validated.sizeBytes,
          pageCount: validated.pageCount,
          sourceLocale: env.DEFAULT_LOCALE,
          status: "QUEUED",
          passThreshold: env.DEFAULT_PASS_THRESHOLD,
        },
      });

      try {
        await enqueueStage({ lessonId, stage: "extract", version: lesson.jobVersion });
      } catch {
        await db.lesson.update({
          where: { id: lessonId },
          data: { status: "FAILED", failureReason: "Could not queue processing" },
        });
        results.push({
          filename: validated.filename,
          status: "rejected",
          lessonId,
          reason: "The file was stored but could not be queued for processing",
        });
        continue;
      }

      results.push({ filename: validated.filename, status: "accepted", lessonId });
    } catch (error) {
      await db.lesson.delete({ where: { id: lessonId } }).catch(() => undefined);
      await storage.deletePrefix(`lessons/${lessonId}`).catch(() => undefined);
      results.push({
        filename: validated.filename,
        status: "rejected",
        reason: error instanceof AppError ? error.message : "The file could not be stored",
      });
    }
  }

  return results;
}
