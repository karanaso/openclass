import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { startTestInfra, type TestInfra } from "./helpers/infra";
import { makeTestPdf } from "./helpers/pdf";
import { resetEnvCache } from "@/lib/env";
import { resetStorage, getStorage } from "@/server/storage";

let infra: TestInfra;
let prisma: PrismaClient;
let storageRoot: string;
let cookie: string;
let shareService: typeof import("@/server/services/share-links");
let studentAuth: typeof import("@/server/auth/student");
let teacherAuth: typeof import("@/server/auth/session");
let ingestion: typeof import("@/server/services/ingestion");
let queueModule: typeof import("@/server/queue");

let adminClasses: typeof import("@/app/api/admin/classes/route");
let gameStart: typeof import("@/app/api/s/[token]/lessons/[lessonId]/game/start/route");
let eventsRoute: typeof import("@/app/api/admin/lessons/[lessonId]/events/route");
let mediaRoute: typeof import("@/app/api/s/[token]/lessons/[lessonId]/media/[locale]/[kind]/route");
let loginRoute: typeof import("@/app/api/auth/login/route");

beforeAll(async () => {
  infra = await startTestInfra();
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "lessonlab-security-"));
  process.env.DATABASE_URL = infra.databaseUrl;
  process.env.REDIS_URL = infra.redisUrl;
  process.env.AUTH_SECRET = "a".repeat(40);
  process.env.TEACHER_PASSWORD = "test-password";
  process.env.AI_PROVIDER = "mock";
  process.env.TTS_PROVIDER = "mock";
  process.env.STORAGE_ROOT = storageRoot;
  process.env.LOGIN_MAX_FAILURES = "3";
  process.env.LOGIN_WINDOW_SECONDS = "60";
  process.env.MAX_UPLOAD_BYTES = String(2 * 1024 * 1024);
  resetEnvCache();
  resetStorage();

  const redis = await import("@/server/redis");
  await redis.closeRedis();
  queueModule = await import("@/server/queue");
  await queueModule.closeLessonQueue();
  prisma = (await import("@/server/db")).prisma;
  shareService = await import("@/server/services/share-links");
  studentAuth = await import("@/server/auth/student");
  teacherAuth = await import("@/server/auth/session");
  ingestion = await import("@/server/services/ingestion");
  adminClasses = await import("@/app/api/admin/classes/route");
  gameStart = await import("@/app/api/s/[token]/lessons/[lessonId]/game/start/route");
  eventsRoute = await import("@/app/api/admin/lessons/[lessonId]/events/route");
  mediaRoute = await import("@/app/api/s/[token]/lessons/[lessonId]/media/[locale]/[kind]/route");
  loginRoute = await import("@/app/api/auth/login/route");
  cookie = await teacherAuth.createSessionToken();
}, 120_000);

afterAll(async () => {
  await queueModule?.closeLessonQueue();
  const redis = await import("@/server/redis");
  await redis.closeRedis();
  await prisma?.$disconnect();
  await rm(storageRoot, { recursive: true, force: true });
  await infra?.stop();
});

async function createLesson(name: string, status: "READY" | "FAILED" = "READY") {
  const classroom = await prisma.class.create({ data: { name: `${name} ${Math.random()}` } });
  return prisma.lesson.create({
    data: {
      classId: classroom.id,
      title: name,
      originalFilename: `${name}.pdf`,
      storageKey: `lessons/${name}/original.pdf`,
      checksum: `${name}-${Math.random()}`,
      sizeBytes: 100,
      pageCount: 1,
      sourceLocale: "en",
      status,
      passThreshold: 60,
    },
  });
}

async function createGameQuestion(lessonId: string) {
  return prisma.question.create({
    data: {
      lessonId,
      mode: "GAME",
      itemKey: `game-${Math.random()}`,
      position: 0,
      type: "MULTIPLE_CHOICE",
      correctOptionId: "a",
      sourcePage: 1,
      translations: {
        create: [
          {
            locale: "en",
            prompt: "Question?",
            options: ["a", "b", "c", "d"].map((id) => ({ id, text: `Option ${id}` })),
            explanation: "Because",
          },
        ],
      },
    },
  });
}

async function studentSession(token: string, name = "Maria") {
  const jwt = await studentAuth.createStudentSessionToken({
    name,
    normalizedName: name.toLowerCase(),
    tokenHash: shareService.hashShareToken(token),
  });
  return `student_session=${jwt}`;
}

describe("security smoke", () => {
  it("protects admin APIs from anonymous and student sessions", async () => {
    const anonymous = await adminClasses.GET(new Request("http://localhost:3000/api/admin/classes"));
    expect(anonymous.status).toBe(401);

    const share = await shareService.createShareLink({ lessonId: (await createLesson("Auth")).id });
    const studentJwt = await studentAuth.createStudentSessionToken({
      name: "Maria",
      normalizedName: "maria",
      tokenHash: shareService.hashShareToken(share.token),
    });
    const asTeacher = await adminClasses.GET(
      new Request("http://localhost:3000/api/admin/classes", {
        headers: { cookie: `teacher_session=${studentJwt}` },
      }),
    );
    expect(asTeacher.status).toBe(401);
  });

  it("keeps share tokens scoped to their lesson and never leaks answer keys", async () => {
    const lessonA = await createLesson("Scoped A");
    const lessonB = await createLesson("Scoped B");
    await createGameQuestion(lessonA.id);
    const share = await shareService.createShareLink({ lessonId: lessonA.id });
    const sessionCookie = await studentSession(share.token);
    const url = `http://localhost:3000/api/s/${share.token}/lessons/${lessonA.id}/game/start`;
    const request = (lessonId: string) =>
      new Request(`http://localhost:3000/api/s/${share.token}/lessons/${lessonId}/game/start`, {
        method: "POST",
        headers: { cookie: sessionCookie, origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify({ locale: "en" }),
      });

    const allowed = await gameStart.POST(request(lessonA.id), { params: Promise.resolve({ token: share.token, lessonId: lessonA.id }) });
    expect(allowed.status).toBe(200);
    const payload = await allowed.text();
    expect(payload).not.toContain("correctOptionId");
    expect(payload).not.toContain("explanation");

    const forbidden = await gameStart.POST(request(lessonB.id), { params: Promise.resolve({ token: share.token, lessonId: lessonB.id }) });
    expect(forbidden.status).toBe(403);
  });

  it("rejects upload abuse and accepts concurrent valid uploads", async () => {
    const classroom = await prisma.class.create({ data: { name: "Uploads" } });
    const nonPdf = await ingestion.ingestUploads(classroom.id, [new File(["hello"], "hello.txt", { type: "text/plain" })]);
    expect(nonPdf[0].status).toBe("rejected");

    process.env.MAX_UPLOAD_BYTES = "100";
    resetEnvCache();
    const tooLarge = await ingestion.ingestUploads(classroom.id, [new File([new Uint8Array(200)], "big.pdf", { type: "application/pdf" })]);
    expect(tooLarge[0].status).toBe("rejected");
    process.env.MAX_UPLOAD_BYTES = String(2 * 1024 * 1024);
    resetEnvCache();

    const pdfs = await Promise.all(
      Array.from({ length: 5 }, async (_, index) => {
        const bytes = await makeTestPdf(`Concurrent lesson ${index}`);
        return new File([bytes.buffer as ArrayBuffer], `concurrent-${index}.pdf`, { type: "application/pdf" });
      }),
    );
    const results = await Promise.all(pdfs.map((file) => ingestion.ingestUploads(classroom.id, [file])));
    const accepted = results.flat().filter((result) => result.status === "accepted");
    expect(accepted).toHaveLength(5);
    expect(new Set(accepted.map((result) => result.lessonId)).size).toBe(5);
  });

  it("rate-limits repeated login failures", async () => {
    const attempt = (ip: string) =>
      loginRoute.POST(
        new Request("http://localhost:3000/api/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": ip },
          body: JSON.stringify({ password: "wrong" }),
        }),
      );
    for (let index = 0; index < 3; index += 1) {
      expect((await attempt("10.9.9.9")).status).toBe(401);
    }
    expect((await attempt("10.9.9.9")).status).toBe(429);
  });

  it("serves video range requests and reconnects SSE status streams", async () => {
    const lesson = await createLesson("Media");
    const share = await shareService.createShareLink({ lessonId: lesson.id });
    const sessionCookie = await studentSession(share.token);
    await prisma.videoAsset.create({
      data: {
        lessonId: lesson.id,
        locale: "en",
        status: "READY",
        storageKey: `lessons/${lesson.id}/video/en.mp4`,
        captionsKey: `lessons/${lesson.id}/video/en.vtt`,
        posterKey: `lessons/${lesson.id}/video/en.jpg`,
      },
    });
    await getStorage().put(`lessons/${lesson.id}/video/en.mp4`, new Uint8Array(1000));
    await getStorage().put(`lessons/${lesson.id}/video/en.vtt`, "WEBVTT\n");
    await getStorage().put(`lessons/${lesson.id}/video/en.jpg`, "jpeg");

    const ranged = await mediaRoute.GET(
      new Request(
        `http://localhost:3000/api/s/${share.token}/lessons/${lesson.id}/media/en/video`,
        { headers: { cookie: sessionCookie, range: "bytes=0-99" } },
      ),
      { params: Promise.resolve({ token: share.token, lessonId: lesson.id, locale: "en", kind: "video" }) },
    );
    expect(ranged.status).toBe(206);
    expect(ranged.headers.get("content-range")).toBe("bytes 0-99/1000");
    await ranged.body?.cancel();

    await prisma.lesson.update({ where: { id: lesson.id }, data: { status: "FAILED", failureReason: "Test" } });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await eventsRoute.GET(
        new Request(`http://localhost:3000/api/admin/lessons/${lesson.id}/events`, {
          headers: { cookie: `teacher_session=${cookie}` },
        }),
        { params: Promise.resolve({ lessonId: lesson.id }) },
      );
      expect(await response.text()).toContain("FAILED");
    }
  });
});
