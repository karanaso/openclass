import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { Worker } from "bullmq";
import { startTestInfra, type TestInfra } from "./helpers/infra";
import { makeTestPdf } from "./helpers/pdf";
import { resetEnvCache } from "@/lib/env";
import { resetStorage, getStorage } from "@/server/storage";

let infra: TestInfra;
let prisma: PrismaClient;
let storageRoot: string;
let cookie: string;
let pdfBytes: Uint8Array;
let ingestion: typeof import("@/server/services/ingestion");
let control: typeof import("@/server/services/lesson-control");
let uploadRoute: typeof import("@/app/api/admin/classes/[classId]/lessons/route");
let eventsRoute: typeof import("@/app/api/admin/lessons/[lessonId]/events/route");
let queueModule: typeof import("@/server/queue");
let worker: Worker | null = null;

function authRequest(pathname: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cookie", `teacher_session=${cookie}`);
  headers.set("origin", "http://localhost:3000");
  return new Request(`http://localhost:3000${pathname}`, { ...init, headers });
}

beforeAll(async () => {
  infra = await startTestInfra();
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "lessonlab-ingest-"));
  process.env.DATABASE_URL = infra.databaseUrl;
  process.env.REDIS_URL = infra.redisUrl;
  process.env.AUTH_SECRET = "a".repeat(40);
  process.env.TEACHER_PASSWORD = "test";
  process.env.AI_PROVIDER = "mock";
  process.env.TTS_PROVIDER = "mock";
  process.env.STORAGE_ROOT = storageRoot;
  process.env.GENERATION_MAX_ATTEMPTS = "1";
  process.env.MAX_UPLOAD_BYTES = String(2 * 1024 * 1024);
  process.env.MAX_PDF_PAGES = "20";
  process.env.DEFAULT_PASS_THRESHOLD = "60";
  resetEnvCache();
  resetStorage();

  const redis = await import("@/server/redis");
  await redis.closeRedis();
  queueModule = await import("@/server/queue");
  await queueModule.closeLessonQueue();
  prisma = (await import("@/server/db")).prisma;
  ingestion = await import("@/server/services/ingestion");
  control = await import("@/server/services/lesson-control");
  uploadRoute = await import("@/app/api/admin/classes/[classId]/lessons/route");
  eventsRoute = await import("@/app/api/admin/lessons/[lessonId]/events/route");
  const session = await import("@/server/auth/session");
  cookie = await session.createSessionToken();
  pdfBytes = await makeTestPdf();
}, 120_000);

afterAll(async () => {
  if (worker) await worker.close();
  await queueModule?.closeLessonQueue();
  const redis = await import("@/server/redis");
  await redis.closeRedis();
  await prisma?.$disconnect();
  await rm(storageRoot, { recursive: true, force: true });
  await infra?.stop();
});

async function createClass(name: string) {
  return prisma.class.create({ data: { name } });
}

function pdfFile(name = "lesson.pdf") {
  const bytes = pdfBytes.slice();
  return new File([bytes.buffer as ArrayBuffer], name, { type: "application/pdf" });
}

describe("upload ingestion", () => {
  it("accepts a PDF and rejects a non-PDF in the same batch", async () => {
    const classroom = await createClass("Ingest class");
    const results = await ingestion.ingestUploads(classroom.id, [
      pdfFile("photosynthesis.pdf"),
      new File(["not a pdf"], "notes.txt", { type: "text/plain" }),
    ]);

    expect(results[0].status, results[0].reason).toBe("accepted");
    expect(results[1].status).toBe("rejected");

    const lesson = await prisma.lesson.findUniqueOrThrow({ where: { id: results[0].lessonId! } });
    expect(lesson.status).toBe("QUEUED");
    expect(lesson.title).toBe("photosynthesis");
    expect(await getStorage().exists(lesson.storageKey)).toBe(true);

    const job = await queueModule.getLessonQueue().getJob(queueModule.jobIdFor({ lessonId: lesson.id, stage: "extract", version: 0 }));
    expect(job).toBeTruthy();
  });

  it("rejects a corrupt PDF and an oversized file", async () => {
    const classroom = await createClass("Invalid class");
    const corrupt = await ingestion.ingestUploads(classroom.id, [
      new File([new TextEncoder().encode("%PDF-1.7 broken")], "broken.pdf", { type: "application/pdf" }),
    ]);
    expect(corrupt[0].status).toBe("rejected");

    const original = process.env.MAX_UPLOAD_BYTES;
    process.env.MAX_UPLOAD_BYTES = "10";
    resetEnvCache();
    const oversized = await ingestion.ingestUploads(classroom.id, [pdfFile()]);
    expect(oversized[0].status).toBe("rejected");
    expect(oversized[0].reason).toMatch(/limit/i);
    process.env.MAX_UPLOAD_BYTES = original;
    resetEnvCache();
  });

  it("warns about duplicates within a class but not across classes", async () => {
    const a = await createClass("Duplicate A");
    const b = await createClass("Duplicate B");
    const first = await ingestion.ingestUploads(a.id, [pdfFile("same.pdf")]);
    expect(first[0].status).toBe("accepted");

    const duplicate = await ingestion.ingestUploads(a.id, [pdfFile("same.pdf")]);
    expect(duplicate[0].status).toBe("duplicate");

    const otherClass = await ingestion.ingestUploads(b.id, [pdfFile("same.pdf")]);
    expect(otherClass[0].status).toBe("accepted");

    const kept = await ingestion.ingestUploads(a.id, [pdfFile("same.pdf")], { allowDuplicates: true });
    expect(kept[0].status).toBe("accepted");
  });

  it("supports the multipart upload API", async () => {
    const classroom = await createClass("API upload");
    const form = new FormData();
    form.append("files", pdfFile("api.pdf"));
    const response = await uploadRoute.POST(
      authRequest(`/api/admin/classes/${classroom.id}/lessons`, { method: "POST", body: form }),
      { params: Promise.resolve({ classId: classroom.id }) },
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.results[0].status).toBe("accepted");
  });
});

describe("lesson control", () => {
  it("cancels a lesson, removes its generated files, and allows retry", async () => {
    const classroom = await createClass("Control class");
    const uploaded = await ingestion.ingestUploads(classroom.id, [pdfFile("control.pdf")]);
    const lessonId = uploaded[0].lessonId!;
    const storedLesson = await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } });
    await getStorage().put(`lessons/${lessonId}/pages/1.png`, "page");

    const cancelled = await control.cancelLesson(lessonId);
    expect(cancelled.status).toBe("CANCELLED");
    expect(await getStorage().exists(`lessons/${lessonId}/pages/1.png`)).toBe(false);
    expect(await getStorage().exists(storedLesson.storageKey)).toBe(true);

    const retried = await control.retryLesson(lessonId);
    expect(retried.status).toBe("QUEUED");
    expect(retried.jobVersion).toBe(1);
    await control.cancelLesson(lessonId);

    const deleted = await control.deleteLesson(lessonId);
    expect(deleted.ok).toBe(true);
    expect(await prisma.lesson.findUnique({ where: { id: lessonId } })).toBeNull();
    expect(await getStorage().exists(storedLesson.storageKey)).toBe(false);
  });

  it("moves a queued lesson through stages to a terminal state with the worker", async () => {
    const classroom = await createClass("Worker class");
    const uploaded = await ingestion.ingestUploads(classroom.id, [pdfFile("worker.pdf")]);
    const lessonId = uploaded[0].lessonId!;

    const { createPipelineWorker } = await import("@/worker/index");
    worker = createPipelineWorker();

    let finalStatus = "QUEUED";
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const lesson = await prisma.lesson.findUniqueOrThrow({ where: { id: lessonId } });
      finalStatus = lesson.status;
      if (["READY", "FAILED", "CANCELLED"].includes(finalStatus)) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    expect(["READY", "FAILED"]).toContain(finalStatus);
    const pages = await prisma.lessonPage.count({ where: { lessonId } });
    expect(pages).toBeGreaterThan(0);

    await worker.close();
    worker = null;
  });

  it("streams a terminal status over SSE", async () => {
    const classroom = await createClass("SSE class");
    const uploaded = await ingestion.ingestUploads(classroom.id, [pdfFile("sse.pdf")]);
    const lessonId = uploaded[0].lessonId!;
    await prisma.lesson.update({ where: { id: lessonId }, data: { status: "FAILED", failureReason: "Test failure" } });

    const response = await eventsRoute.GET(authRequest(`/api/admin/lessons/${lessonId}/events`), {
      params: Promise.resolve({ lessonId }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const text = await response.text();
    expect(text).toContain("FAILED");
    expect(text).toContain("Test failure");
  });
});
