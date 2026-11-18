import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nextTestAccessCode } from "./helpers/access-code";
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
let lessonData: typeof import("@/server/student/lesson-data");
let queueModule: typeof import("@/server/queue");

let adminClasses: typeof import("@/app/api/admin/classes/route");
let adminShareLinks: typeof import("@/app/api/admin/share-links/route");
let gameStart: typeof import("@/app/api/s/[token]/lessons/[lessonId]/game/start/route");
let eventsRoute: typeof import("@/app/api/admin/lessons/[lessonId]/events/route");
let sourceRoute: typeof import("@/app/api/s/[token]/lessons/[lessonId]/source/route");
let sessionRoute: typeof import("@/app/api/s/[token]/session/route");
let loginRoute: typeof import("@/app/api/auth/login/route");

beforeAll(async () => {
  infra = await startTestInfra();
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "lessonlab-security-"));
  process.env.DATABASE_URL = infra.databaseUrl;
  process.env.REDIS_URL = infra.redisUrl;
  process.env.AUTH_SECRET = "a".repeat(40);
  process.env.TEACHER_PASSWORD = "test-password";
  process.env.AI_PROVIDER = "mock";
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
  lessonData = await import("@/server/student/lesson-data");
  adminClasses = await import("@/app/api/admin/classes/route");
  adminShareLinks = await import("@/app/api/admin/share-links/route");
  gameStart = await import("@/app/api/s/[token]/lessons/[lessonId]/game/start/route");
  eventsRoute = await import("@/app/api/admin/lessons/[lessonId]/events/route");
  sourceRoute = await import("@/app/api/s/[token]/lessons/[lessonId]/source/route");
  sessionRoute = await import("@/app/api/s/[token]/session/route");
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
      accessCode: nextTestAccessCode(),
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
    school: "Test School",
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
      school: "Test School",
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

  it("returns share tokens only to authenticated admins", async () => {
    const lesson = await createLesson("Admin listing");
    const created = await shareService.createShareLink({ lessonId: lesson.id });
    const url = `http://localhost:3000/api/admin/share-links?lessonId=${lesson.id}`;

    const anonymous = await adminShareLinks.GET(new Request(url));
    expect(anonymous.status).toBe(401);
    expect(await anonymous.text()).not.toContain(created.token);

    const authed = await adminShareLinks.GET(
      new Request(url, { headers: { cookie: `teacher_session=${cookie}` } }),
    );
    expect(authed.status).toBe(200);
    const body = (await authed.json()) as { links: Array<{ id: string; token: string | null }> };
    expect(body.links.find((link) => link.id === created.link.id)?.token).toBe(created.token);
  });

  it("never exposes a share link token as a field to students", async () => {
    const lesson = await createLesson("Token confidentiality");
    const share = await shareService.createShareLink({ lessonId: lesson.id });

    const sessionResponse = await sessionRoute.POST(
      new Request(`http://localhost:3000/api/s/${share.token}/session`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Maria", school: "Test School" }),
      }),
      { params: Promise.resolve({ token: share.token }) },
    );
    expect(sessionResponse.status).toBe(200);
    expect(await sessionResponse.text()).not.toContain(share.token);

    const studentData = await lessonData.loadLessonForStudent({
      lessonId: lesson.id,
      locale: "en",
      token: share.token,
      normalizedStudentName: "maria",
    });
    expect(studentData).not.toBeNull();
    expect(JSON.stringify(studentData)).not.toContain(share.token);
    expect(JSON.stringify(studentData)).not.toMatch(/"token"\s*:/);
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

  it("serves the original lesson PDF only through the scoped student route", async () => {
    const lesson = await createLesson("Source-document");
    const other = await createLesson("Other-document");
    const bytes = Buffer.from("%PDF-1.4\nsource material\n");
    await getStorage().put(lesson.storageKey, new Uint8Array(bytes));
    await prisma.lesson.update({
      where: { id: lesson.id },
      data: { originalFilename: `Μάθημα "1".pdf` },
    });

    const share = await shareService.createShareLink({ lessonId: lesson.id });
    const sessionCookie = await studentSession(share.token);
    const params = (lessonId = lesson.id) => ({ params: Promise.resolve({ token: share.token, lessonId }) });
    const request = (lessonId = lesson.id, headers: Record<string, string> = {}) =>
      new Request(`http://localhost:3000/api/s/${share.token}/lessons/${lessonId}/source`, { headers });

    const anonymous = await sourceRoute.GET(request(), params());
    expect(anonymous.status).toBe(401);

    const forbidden = await sourceRoute.GET(request(other.id, { cookie: sessionCookie }), params(other.id));
    expect(forbidden.status).toBe(403);

    const unknownLesson = await sourceRoute.GET(
      request("does-not-exist", { cookie: sessionCookie }),
      params("does-not-exist"),
    );
    expect(unknownLesson.status).toBe(403);

    const full = await sourceRoute.GET(request(lesson.id, { cookie: sessionCookie }), params());
    expect(full.status).toBe(200);
    expect(full.headers.get("content-type")).toBe("application/pdf");
    expect(full.headers.get("content-length")).toBe(String(bytes.length));
    const disposition = full.headers.get("content-disposition") ?? "";
    expect(disposition).toContain("inline");
    expect(disposition).toContain("filename*=UTF-8''");
    expect(disposition).not.toContain("Μάθημα");
    expect(JSON.stringify([...full.headers.entries()])).not.toContain(lesson.storageKey);
    expect(new Uint8Array(await full.arrayBuffer())).toEqual(new Uint8Array(bytes));

    const ranged = await sourceRoute.GET(
      request(lesson.id, { cookie: sessionCookie, range: "bytes=0-3" }),
      params(),
    );
    expect(ranged.status).toBe(206);
    expect(ranged.headers.get("content-range")).toBe(`bytes 0-3/${bytes.length}`);
    expect(ranged.headers.get("content-disposition")).toContain("filename*=UTF-8''");
    expect(new Uint8Array(await ranged.arrayBuffer())).toEqual(new Uint8Array(Buffer.from("%PDF")));

    const missingFile = await createLesson("Missing-file");
    const missingShare = await shareService.createShareLink({ lessonId: missingFile.id });
    const missing = await sourceRoute.GET(
      new Request(`http://localhost:3000/api/s/${missingShare.token}/lessons/${missingFile.id}/source`, {
        headers: { cookie: await studentSession(missingShare.token) },
      }),
      { params: Promise.resolve({ token: missingShare.token, lessonId: missingFile.id }) },
    );
    expect(missing.status).toBe(404);
  });

  it("reconnects SSE status streams", async () => {
    const lesson = await createLesson("Media");
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
