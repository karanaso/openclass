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
let lessonData: typeof import("@/server/student/lesson-data");
let queueModule: typeof import("@/server/queue");

let adminClasses: typeof import("@/app/api/admin/classes/route");
let adminShareLinks: typeof import("@/app/api/admin/share-links/route");
let gameStart: typeof import("@/app/api/s/[token]/lessons/[lessonId]/game/start/route");
let eventsRoute: typeof import("@/app/api/admin/lessons/[lessonId]/events/route");
let videoRoute: typeof import("@/app/api/admin/lessons/[lessonId]/video/route");
let adminMediaRoute: typeof import("@/app/api/admin/lessons/[lessonId]/media/[locale]/[kind]/route");
let mediaRoute: typeof import("@/app/api/s/[token]/lessons/[lessonId]/media/[locale]/[kind]/route");
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
  lessonData = await import("@/server/student/lesson-data");
  adminClasses = await import("@/app/api/admin/classes/route");
  adminShareLinks = await import("@/app/api/admin/share-links/route");
  gameStart = await import("@/app/api/s/[token]/lessons/[lessonId]/game/start/route");
  eventsRoute = await import("@/app/api/admin/lessons/[lessonId]/events/route");
  videoRoute = await import("@/app/api/admin/lessons/[lessonId]/video/route");
  adminMediaRoute = await import("@/app/api/admin/lessons/[lessonId]/media/[locale]/[kind]/route");
  mediaRoute = await import("@/app/api/s/[token]/lessons/[lessonId]/media/[locale]/[kind]/route");
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
        body: JSON.stringify({ name: "Maria" }),
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

  it("serves admin video previews only to teachers and scopes them to ready assets", async () => {
    const lesson = await createLesson("Admin preview");
    const storageKey = `lessons/${lesson.id}/video/en.mp4`;
    const captionsKey = `lessons/${lesson.id}/video/en.vtt`;
    const posterKey = `lessons/${lesson.id}/video/en.jpg`;
    await prisma.videoAsset.create({
      data: { lessonId: lesson.id, locale: "en", status: "READY", storageKey, captionsKey, posterKey },
    });
    await getStorage().put(storageKey, new Uint8Array(1000));
    await getStorage().put(captionsKey, "WEBVTT\n");
    await getStorage().put(posterKey, "jpeg");

    const mediaRequest = (headers: Record<string, string> = {}, locale = "en") =>
      new Request(`http://localhost:3000/api/admin/lessons/${lesson.id}/media/${locale}/video`, { headers });
    const params = (locale = "en") => ({ params: Promise.resolve({ lessonId: lesson.id, locale, kind: "video" }) });

    const anonymous = await adminMediaRoute.GET(mediaRequest(), params());
    expect(anonymous.status).toBe(401);

    const share = await shareService.createShareLink({ lessonId: lesson.id });
    const asStudent = await adminMediaRoute.GET(
      mediaRequest({ cookie: await studentSession(share.token) }),
      params(),
    );
    expect(asStudent.status).toBe(401);

    const full = await adminMediaRoute.GET(mediaRequest({ cookie: `teacher_session=${cookie}` }), params());
    expect(full.status).toBe(200);
    expect(full.headers.get("content-type")).toBe("video/mp4");
    expect(full.headers.get("content-length")).toBe("1000");
    expect(JSON.stringify([...full.headers.entries()])).not.toContain(storageKey);
    await full.body?.cancel();

    const ranged = await adminMediaRoute.GET(
      mediaRequest({ cookie: `teacher_session=${cookie}`, range: "bytes=10-19" }),
      params(),
    );
    expect(ranged.status).toBe(206);
    expect(ranged.headers.get("content-range")).toBe("bytes 10-19/1000");
    await ranged.body?.cancel();

    const missingVariant = await adminMediaRoute.GET(
      mediaRequest({ cookie: `teacher_session=${cookie}` }, "el"),
      params("el"),
    );
    expect(missingVariant.status).toBe(404);

    await prisma.videoAsset.update({
      where: { lessonId_locale: { lessonId: lesson.id, locale: "en" } },
      data: { status: "PENDING" },
    });
    const pending = await adminMediaRoute.GET(mediaRequest({ cookie: `teacher_session=${cookie}` }), params());
    expect(pending.status).toBe(404);
  });

  it("queues a fresh re-render for a ready variant and rejects processing variants", async () => {
    const lesson = await createLesson("Recreate");
    await prisma.lessonPage.create({
      data: { lessonId: lesson.id, pageNumber: 1, text: "Photosynthesis converts light into energy." },
    });
    await prisma.videoAsset.create({ data: { lessonId: lesson.id, locale: "en", status: "READY" } });

    const post = (headers: Record<string, string> = {}) =>
      videoRoute.POST(
        new Request(`http://localhost:3000/api/admin/lessons/${lesson.id}/video`, {
          method: "POST",
          headers: { "content-type": "application/json", ...headers },
          body: JSON.stringify({ locale: "en" }),
        }),
        { params: Promise.resolve({ lessonId: lesson.id }) },
      );
    const teacherHeaders = { cookie: `teacher_session=${cookie}`, origin: "http://localhost:3000" };
    const jobsForLesson = async () =>
      (await queueModule.getLessonQueue().getJobs(["waiting", "delayed", "paused", "prioritized", "active"])).filter(
        (job) => job?.data.lessonId === lesson.id,
      );

    const anonymous = await post();
    expect(anonymous.status).toBe(401);
    expect(await jobsForLesson()).toHaveLength(0);

    const first = await post(teacherHeaders);
    expect(first.status).toBe(202);
    const second = await post(teacherHeaders);
    expect(second.status).toBe(409);

    const queued = await jobsForLesson();
    expect(queued).toHaveLength(1);
    expect(queued[0]?.name).toBe("narration");
    expect(queued[0]?.data.runId).toBeTruthy();
    expect(queued[0]?.id).toBe(queueModule.jobIdFor(queued[0]!.data));

    const rejected = await post(teacherHeaders);
    expect(rejected.status).toBe(409);
    expect(await jobsForLesson()).toHaveLength(1);

    await queueModule.removeJobsForLesson(lesson.id, lesson.jobVersion);
  });

  it("does not queue video work for a cancelled lesson", async () => {
    const lesson = await createLesson("Cancelled video");
    await prisma.lessonPage.create({
      data: { lessonId: lesson.id, pageNumber: 1, text: "Photosynthesis converts light into energy." },
    });
    await prisma.lesson.update({ where: { id: lesson.id }, data: { status: "CANCELLED" } });

    const response = await videoRoute.POST(
      new Request(`http://localhost:3000/api/admin/lessons/${lesson.id}/video`, {
        method: "POST",
        headers: {
          cookie: `teacher_session=${cookie}`,
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ locale: "en" }),
      }),
      { params: Promise.resolve({ lessonId: lesson.id }) },
    );
    expect(response.status).toBe(409);
    const jobs = await queueModule
      .getLessonQueue()
      .getJobs(["waiting", "delayed", "paused", "prioritized", "active"]);
    expect(jobs.filter((job) => job?.data.lessonId === lesson.id)).toHaveLength(0);
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
