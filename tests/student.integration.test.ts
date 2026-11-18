import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nextTestAccessCode } from "./helpers/access-code";
import { SignJWT } from "jose";
import type { PrismaClient } from "@prisma/client";
import { startTestInfra, type TestInfra } from "./helpers/infra";
import { resetEnvCache } from "@/lib/env";
import { getStorage, resetStorage } from "@/server/storage";

let infra: TestInfra;
let prisma: PrismaClient;
let storageRoot: string;
let share: typeof import("@/server/services/share-links");
let studentAccess: typeof import("@/server/services/student-access");
let studentGuard: typeof import("@/server/student/guard");
let questionnaire: typeof import("@/server/student/questionnaire");
let game: typeof import("@/server/student/game");
let lessonData: typeof import("@/server/student/lesson-data");
let session: typeof import("@/server/auth/student");
let sessionRoute: typeof import("@/app/api/s/[token]/session/route");
let codeRoute: typeof import("@/app/api/s/code/route");
let gameStartRoute: typeof import("@/app/api/s/[token]/lessons/[lessonId]/game/start/route");
let queueModule: typeof import("@/server/queue");
let attemptsRepository: typeof import("@/server/repositories/attempts");
let classSummary: typeof import("@/server/student/class-summary");

beforeAll(async () => {
  infra = await startTestInfra();
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "lessonlab-student-"));
  process.env.DATABASE_URL = infra.databaseUrl;
  process.env.REDIS_URL = infra.redisUrl;
  process.env.AUTH_SECRET = "a".repeat(40);
  process.env.TEACHER_PASSWORD = "test";
  process.env.AI_PROVIDER = "mock";
  process.env.STORAGE_ROOT = storageRoot;
  resetEnvCache();
  resetStorage();

  const redis = await import("@/server/redis");
  await redis.closeRedis();
  queueModule = await import("@/server/queue");
  await queueModule.closeLessonQueue();
  prisma = (await import("@/server/db")).prisma;
  share = await import("@/server/services/share-links");
  studentAccess = await import("@/server/services/student-access");
  studentGuard = await import("@/server/student/guard");
  questionnaire = await import("@/server/student/questionnaire");
  game = await import("@/server/student/game");
  lessonData = await import("@/server/student/lesson-data");
  session = await import("@/server/auth/student");
  sessionRoute = await import("@/app/api/s/[token]/session/route");
  codeRoute = await import("@/app/api/s/code/route");
  gameStartRoute = await import("@/app/api/s/[token]/lessons/[lessonId]/game/start/route");
  attemptsRepository = await import("@/server/repositories/attempts");
  classSummary = await import("@/server/student/class-summary");
}, 120_000);

afterAll(async () => {
  await queueModule?.closeLessonQueue();
  const redis = await import("@/server/redis");
  await redis.closeRedis();
  await prisma?.$disconnect();
  await rm(storageRoot, { recursive: true, force: true });
  await infra?.stop();
});

async function createLessonFixture(options: { includeEnglish?: boolean } = {}) {
  const includeEnglish = options.includeEnglish ?? true;
  const classroom = await prisma.class.create({ data: { name: `Student ${Math.random()}` } });
  const lesson = await prisma.lesson.create({
    data: {
      classId: classroom.id,
      accessCode: nextTestAccessCode(),
      title: "Photosynthesis",
      originalFilename: "photosynthesis.pdf",
      storageKey: `lessons/test/${Math.random()}.pdf`,
      checksum: `student-${Math.random()}`,
      sizeBytes: 100,
      pageCount: 2,
      sourceLocale: "el",
      status: "READY",
      passThreshold: 60,
    },
  });

  for (let index = 0; index < 2; index += 1) {
    await prisma.card.create({
      data: {
        lessonId: lesson.id,
        itemKey: `card-${index + 1}`,
        position: index,
        sourcePage: index + 1,
        translations: {
          create: [
            { locale: "el", prompt: `Κάρτα ${index + 1}`, answer: `Απάντηση ${index + 1}` },
            ...(includeEnglish ? [{ locale: "en", prompt: `Card ${index + 1}`, answer: `Answer ${index + 1}` }] : []),
          ],
        },
      },
    });
  }

  for (const mode of ["QUESTIONNAIRE", "GAME"] as const) {
    const count = mode === "QUESTIONNAIRE" ? 3 : 2;
    for (let index = 0; index < count; index += 1) {
      const options = ["a", "b", "c", "d"].map((id) => ({ id, text: `${mode} option ${id} ${index}` }));
      await prisma.question.create({
        data: {
          lessonId: lesson.id,
          mode,
          itemKey: `${mode}-${index + 1}`,
          position: index,
          type: "MULTIPLE_CHOICE",
          correctOptionId: "a",
          sourcePage: 1,
          translations: {
            create: [
              {
                locale: "el",
                prompt: `Ερώτηση ${mode} ${index + 1}`,
                options,
                explanation: `Εξήγηση ${index + 1}`,
              },
              ...(includeEnglish
                ? [
                    {
                      locale: "en",
                      prompt: `Question ${mode} ${index + 1}`,
                      options,
                      explanation: `Explanation ${index + 1}`,
                    },
                  ]
                : []),
            ],
          },
        },
      });
    }
  }

  return { classroom, lesson };
}

describe("lesson source document", () => {
  it("exposes a share-scoped source URL when the PDF exists", async () => {
    const { lesson } = await createLessonFixture();
    await getStorage().put(lesson.storageKey, new Uint8Array([37, 80, 68, 70]));

    const data = await lessonData.loadLessonForStudent({
      lessonId: lesson.id,
      locale: "el",
      token: "raw-token",
      normalizedStudentName: "maria",
    });

    expect(data?.sourceDocument).toEqual({
      url: `/api/s/raw-token/lessons/${lesson.id}/source`,
      filename: "photosynthesis.pdf",
    });
    expect(data?.sourceDocument?.url).not.toContain(lesson.storageKey);
    expect(JSON.stringify(data)).not.toContain(lesson.storageKey);
  });

  it("returns null when the stored PDF is missing", async () => {
    const { lesson } = await createLessonFixture();
    const data = await lessonData.loadLessonForStudent({
      lessonId: lesson.id,
      locale: "el",
      token: "raw-token",
      normalizedStudentName: "maria",
    });

    expect(data?.sourceDocument).toBeNull();
  });
});

describe("share links", () => {
  it("creates hashed tokens that resolve by raw token", async () => {
    const { lesson } = await createLessonFixture();
    const created = await share.createShareLink({ lessonId: lesson.id });
    expect(created.token).toHaveLength(43);
    const stored = await prisma.shareLink.findUniqueOrThrow({ where: { id: created.link.id } });
    expect(stored.tokenHash).not.toBe(created.token);
    expect(stored.token).toBe(created.token);
    const resolved = await share.resolveShareToken(created.token);
    expect(resolved.lessonId).toBe(lesson.id);
  });

  it("lists share links with their token for admin copying", async () => {
    const { lesson } = await createLessonFixture();
    const created = await share.createShareLink({ lessonId: lesson.id });
    const listed = await share.listShareLinks({ lessonId: lesson.id });
    expect(listed.find((link) => link.id === created.link.id)?.token).toBe(created.token);
  });

  it("denies revoked and expired links", async () => {
    const { lesson } = await createLessonFixture();
    const created = await share.createShareLink({ lessonId: lesson.id });
    await share.revokeShareLink(created.link.id);
    await expect(share.resolveShareToken(created.token)).rejects.toMatchObject({ code: "invalid_token" });

    const expired = await share.createShareLink({
      lessonId: lesson.id,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    await expect(share.resolveShareToken(expired.token)).rejects.toMatchObject({ code: "expired_token" });
  });

  it("scopes class links to the class's ready lessons", async () => {
    const { classroom, lesson } = await createLessonFixture();
    const created = await share.createShareLink({ classId: classroom.id });
    const resolved = await share.resolveShareToken(created.token);
    expect(resolved.class?.lessons.map((item) => item.id)).toContain(lesson.id);
  });
});

describe("student access codes", () => {
  it("resolves a lesson number to its lesson without a share link", async () => {
    const { lesson } = await createLessonFixture();
    const resolved = await studentAccess.resolveStudentAccess(lesson.accessCode);

    expect(resolved.kind).toBe("code");
    expect(resolved.lessonId).toBe(lesson.id);
    expect(resolved.classId).toBe(lesson.classId);
    expect(resolved.lesson?.title).toBe("Photosynthesis");
    expect(resolved.class).toBeNull();
  });

  it("rejects an unused number with an invalid-code error", async () => {
    await expect(studentAccess.resolveStudentAccess("999999999")).rejects.toMatchObject({
      code: "invalid_code",
      status: 404,
    });
  });

  it("scopes numeric lesson access to the owning lesson", async () => {
    const first = await createLessonFixture();
    const second = await createLessonFixture();
    const resolved = await studentAccess.resolveStudentAccess(first.lesson.accessCode);

    expect(() => studentGuard.assertLessonInShare(resolved, first.lesson.id)).not.toThrow();
    expect(() => studentGuard.assertLessonInShare(resolved, second.lesson.id)).toThrow();
  });

  it("applies the shared lockout to repeated numeric lookups", async () => {
    const { lesson } = await createLessonFixture();
    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        studentAccess.resolveAccessCodeWithThrottle("999999999", ip),
      ).rejects.toMatchObject({ code: "invalid_code" });
    }
    await expect(
      studentAccess.resolveAccessCodeWithThrottle(lesson.accessCode, ip),
    ).rejects.toMatchObject({ code: "rate_limited" });

    const redis = await import("@/server/redis");
    await redis.getRedis().del(`lesson-code:fail:${ip}`, `lesson-code:lock:${ip}`);

    await expect(
      studentAccess.resolveAccessCodeWithThrottle(lesson.accessCode, ip),
    ).resolves.toMatchObject({ kind: "code", lessonId: lesson.id });
  });

  it("creates a session scoped to the number and rejects another number", async () => {
    const first = await createLessonFixture();
    const second = await createLessonFixture();
    const response = await sessionRoute.POST(
      new Request(`http://localhost:3000/api/s/${first.lesson.accessCode}/session`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Maria", school: "1ο Γυμνάσιο" }),
      }),
      { params: Promise.resolve({ token: first.lesson.accessCode }) },
    );

    expect(response.status).toBe(200);
    expect(((await response.json()) as { lessonId: string }).lessonId).toBe(first.lesson.id);
    const cookie = response.headers
      .get("set-cookie")
      ?.match(new RegExp(`${session.STUDENT_COOKIE}=([^;]+)`))?.[1];
    expect(cookie).toBeTruthy();

    const request = (identifier: string) =>
      new Request(`http://localhost:3000/api/s/${identifier}/lessons/${first.lesson.id}/deck-view`, {
        method: "POST",
        headers: { cookie: `${session.STUDENT_COOKIE}=${cookie}` },
      });

    await expect(studentGuard.requireStudentContext(request(first.lesson.accessCode), first.lesson.accessCode)).resolves.toMatchObject({
      session: { name: "Maria" },
    });
    await expect(studentGuard.requireStudentContext(request(second.lesson.accessCode), second.lesson.accessCode)).rejects.toMatchObject({
      code: "unauthorized",
    });
  });
});

describe("public code lookup route", () => {
  const request = (code: string, ip: string) =>
    codeRoute.POST(
      new Request("http://localhost:3000/api/s/code", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({ code }),
      }),
    );

  it("rejects malformed numbers before lookup", async () => {
    const response = await request("123", "198.51.100.10");
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "validation_error" } });
  });

  it("returns the lesson id for a valid number", async () => {
    const { lesson } = await createLessonFixture();
    const response = await request(lesson.accessCode, "198.51.100.11");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ lessonId: lesson.id });
  });

  it("reports an unknown number as not found", async () => {
    const response = await request("999999999", "198.51.100.12");
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "code_not_found" } });
  });

  it("locks out after five unknown numbers and blocks a valid number", async () => {
    const { lesson } = await createLessonFixture();
    const ip = "198.51.100.13";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await request("999999999", ip)).status).toBe(404);
    }

    const blocked = await request(lesson.accessCode, ip);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
    expect(await blocked.json()).toMatchObject({
      error: { code: "code_rate_limited", details: { retryAfter: expect.any(Number) } },
    });
  });

  it("clears the failure count after a successful lookup", async () => {
    const { lesson } = await createLessonFixture();
    const ip = "198.51.100.14";
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await request("999999999", ip)).status).toBe(404);
    }
    expect((await request(lesson.accessCode, ip)).status).toBe(200);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await request("999999999", ip)).status).toBe(404);
    }
    expect((await request(lesson.accessCode, ip)).status).toBe(200);
  });
});

describe("student session", () => {
  it("round-trips and rejects tampered sessions", async () => {
    const token = await session.createStudentSessionToken({
      name: "Maria",
      normalizedName: "maria",
      school: "1ο Γυμνάσιο",
      tokenHash: share.hashShareToken("abc"),
    });
    const parsed = await session.verifyStudentSessionToken(token);
    expect(parsed?.name).toBe("Maria");
    expect(parsed?.school).toBe("1ο Γυμνάσιο");
    expect(await session.verifyStudentSessionToken(`${token}x`)).toBeNull();
  });

  it("rejects a session token without a school", async () => {
    const token = await new SignJWT({
      role: "student",
      name: "Maria",
      normalizedName: "maria",
      tokenHash: share.hashShareToken("abc"),
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setIssuer("lessonlab")
      .setAudience("student")
      .setExpirationTime("3600s")
      .sign(new TextEncoder().encode("a".repeat(40)));
    expect(await session.verifyStudentSessionToken(token)).toBeNull();
  });
});

describe("student session route", () => {
  it("requires a valid school and stores it in the session", async () => {
    const { lesson } = await createLessonFixture();
    const link = await share.createShareLink({ lessonId: lesson.id });
    const post = (body: unknown) =>
      sessionRoute.POST(
        new Request(`http://localhost:3000/api/s/${link.token}/session`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ token: link.token }) },
      );

    const accepted = await post({ name: "Maria", school: "  1ο   Γυμνάσιο  " });
    expect(accepted.status).toBe(200);
    const payload = (await accepted.json()) as { school: string };
    expect(payload.school).toBe("1ο Γυμνάσιο");
    const acceptedCookies = (accepted as unknown as { cookies: { get(name: string): { value: string } | undefined } }).cookies;
    const sessionToken = acceptedCookies.get("student_session")?.value;
    expect((await session.verifyStudentSessionToken(sessionToken!))?.school).toBe("1ο Γυμνάσιο");
    expect(acceptedCookies.get("student_school")?.value).toBe("1ο Γυμνάσιο");

    expect((await post({ name: "Maria", school: "   " })).status).toBe(422);
    expect((await post({ name: "Maria", school: "a".repeat(121) })).status).toBe(422);
  });

  it("clears the school cookie on logout", async () => {
    const response = await sessionRoute.DELETE();
    expect(response.status).toBe(200);
    const responseCookies = (
      response as unknown as {
        cookies: { getAll(): Array<{ name: string; maxAge: number }>; get(name: string): { maxAge: number } | undefined };
      }
    ).cookies;
    expect(responseCookies.getAll().map((cookie) => cookie.name)).toContain("student_school");
    expect(responseCookies.get("student_school")?.maxAge).toBe(0);
  });
});

describe("questionnaire class summary data", () => {
  it("reads only completed questionnaire percentages for the lesson", async () => {
    const { lesson } = await createLessonFixture();
    const attemptBase = {
      lessonId: lesson.id,
      studentName: "Maria",
      normalizedStudentName: "maria",
      studentSchool: "Test School",
      locale: "el",
      score: 4,
      maxScore: 5,
      percentage: 80,
      passed: true,
      durationMs: 1000,
    };

    await prisma.attempt.create({ data: { ...attemptBase, mode: "QUESTIONNAIRE", completedAt: new Date() } });
    await prisma.attempt.create({ data: { ...attemptBase, mode: "QUESTIONNAIRE", completedAt: null } });
    await prisma.attempt.create({ data: { ...attemptBase, mode: "GAME", completedAt: new Date() } });
    await prisma.attemptDraft.create({
      data: {
        lessonId: lesson.id,
        normalizedStudentName: "maria",
        locale: "el",
        answers: {},
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const percentages = await attemptsRepository.listCompletedQuestionnairePercentages(lesson.id);
    expect(percentages).toEqual([80]);
  });

  it("computes aggregate statistics and bands from completed attempts, counting retakes", async () => {
    const { lesson } = await createLessonFixture();
    const percentages = [100, 75, 50, 20];
    for (const [index, percentage] of percentages.entries()) {
      await prisma.attempt.create({
        data: {
          lessonId: lesson.id,
          studentName: "Maria",
          normalizedStudentName: "maria",
          mode: "QUESTIONNAIRE",
          locale: "el",
          score: Math.round(percentage / 20),
          maxScore: 5,
          percentage,
          passed: percentage >= 60,
          durationMs: 1000,
          completedAt: new Date(Date.now() + index),
        },
      });
    }

    const summary = await classSummary.getLessonQuestionnaireSummary(lesson.id, 75);
    expect(summary).not.toBeNull();
    expect(summary?.attempts).toBe(4);
    expect(summary?.average).toBe(61);
    expect(summary?.highest).toBe(100);
    expect(summary?.lowest).toBe(20);
    expect(summary?.currentBand).toBe("60-79");
    expect(summary?.distribution).toEqual([
      { band: "0-19", count: 0 },
      { band: "20-39", count: 1 },
      { band: "40-59", count: 1 },
      { band: "60-79", count: 1 },
      { band: "80-100", count: 1 },
    ]);
  });

  it("suppresses the summary below three completed attempts", async () => {
    const { lesson } = await createLessonFixture();
    await prisma.attempt.create({
      data: {
        lessonId: lesson.id,
        studentName: "Maria",
        normalizedStudentName: "maria",
        mode: "QUESTIONNAIRE",
        locale: "el",
        score: 3,
        maxScore: 5,
        percentage: 60,
        passed: true,
        durationMs: 1000,
        completedAt: new Date(),
      },
    });
    await prisma.attempt.create({
      data: {
        lessonId: lesson.id,
        studentName: "Nikos",
        normalizedStudentName: "nikos",
        mode: "QUESTIONNAIRE",
        locale: "el",
        score: 4,
        maxScore: 5,
        percentage: 80,
        passed: true,
        durationMs: 1000,
        completedAt: new Date(),
      },
    });

    expect(await classSummary.getLessonQuestionnaireSummary(lesson.id, 60)).toBeNull();
  });
});

describe("questionnaire grading", () => {
  it("grades answers, returns feedback, and blocks a second attempt", async () => {
    const { lesson } = await createLessonFixture();
    const questions = await prisma.question.findMany({ where: { lessonId: lesson.id, mode: "QUESTIONNAIRE" }, orderBy: { position: "asc" } });
    const result = await questionnaire.submitQuestionnaire({
      lessonId: lesson.id,
      studentName: "Maria",
      normalizedStudentName: "maria",
      studentSchool: "Test School",
      locale: "en",
      answers: questions.map((question) => ({ questionId: question.id, optionId: "a" })),
      durationMs: 5000,
      idempotencyKey: "submit-1",
      retakeEnabled: false,
      passThreshold: 60,
    });
    expect(result.blocked).toBe(false);
    expect(result.result.score).toBe(3);
    expect(result.result.percentage).toBe(100);
    expect(result.result.feedback).toHaveLength(3);
    const stored = await prisma.attempt.findUniqueOrThrow({ where: { id: result.result.attemptId } });
    expect(stored.studentSchool).toBe("Test School");

    const duplicate = await questionnaire.submitQuestionnaire({
      lessonId: lesson.id,
      studentName: "Maria",
      normalizedStudentName: "maria",
      studentSchool: "Test School",
      locale: "en",
      answers: [],
      durationMs: 1,
      idempotencyKey: "submit-2",
      retakeEnabled: false,
      passThreshold: 60,
    });
    expect(duplicate.blocked).toBe(true);
    expect(duplicate.result.score).toBe(3);
  });

  it("keeps the school supplied for each attempt", async () => {
    const { lesson } = await createLessonFixture();
    const questions = await prisma.question.findMany({ where: { lessonId: lesson.id, mode: "QUESTIONNAIRE" }, orderBy: { position: "asc" } });
    const submit = (school: string, idempotencyKey: string) =>
      questionnaire.submitQuestionnaire({
        lessonId: lesson.id,
        studentName: "Sofia",
        normalizedStudentName: "sofia",
        studentSchool: school,
        locale: "el",
        answers: [{ questionId: questions[0].id, optionId: "a" }],
        durationMs: 1000,
        idempotencyKey,
        retakeEnabled: true,
        passThreshold: 60,
      });

    const first = await submit("School A", "school-1");
    const second = await submit("School B", "school-2");
    const rows = await prisma.attempt.findMany({
      where: { lessonId: lesson.id, normalizedStudentName: "sofia" },
      orderBy: { createdAt: "asc" },
      select: { id: true, studentSchool: true },
    });
    expect(rows.map((row) => row.studentSchool)).toEqual(["School A", "School B"]);
    expect(rows.find((row) => row.id === first.result.attemptId)?.studentSchool).toBe("School A");
    expect(rows.find((row) => row.id === second.result.attemptId)?.studentSchool).toBe("School B");
  });

  it("allows retakes with a new attempt and keeps idempotent submissions", async () => {
    const { lesson } = await createLessonFixture();
    const questions = await prisma.question.findMany({ where: { lessonId: lesson.id, mode: "QUESTIONNAIRE" }, orderBy: { position: "asc" } });
    const first = await questionnaire.submitQuestionnaire({
      lessonId: lesson.id,
      studentName: "Nikos",
      normalizedStudentName: "nikos",
      studentSchool: "Test School",
      locale: "el",
      answers: [{ questionId: questions[0].id, optionId: "a" }],
      durationMs: 1000,
      idempotencyKey: "retake-1",
      retakeEnabled: true,
      passThreshold: 60,
    });
    expect(first.result.score).toBe(1);
    expect(first.result.percentage).toBe(33);

    const same = await questionnaire.submitQuestionnaire({
      lessonId: lesson.id,
      studentName: "Nikos",
      normalizedStudentName: "nikos",
      studentSchool: "Test School",
      locale: "el",
      answers: [{ questionId: questions[0].id, optionId: "b" }],
      durationMs: 1000,
      idempotencyKey: "retake-1",
      retakeEnabled: true,
      passThreshold: 60,
    });
    expect(same.result.attemptId).toBe(first.result.attemptId);

    const newAttempt = await questionnaire.submitQuestionnaire({
      lessonId: lesson.id,
      studentName: "Nikos",
      normalizedStudentName: "nikos",
      studentSchool: "Test School",
      locale: "el",
      answers: questions.map((question) => ({ questionId: question.id, optionId: "a" })),
      durationMs: 1000,
      idempotencyKey: "retake-2",
      retakeEnabled: true,
      passThreshold: 60,
    });
    expect(newAttempt.result.attemptId).not.toBe(first.result.attemptId);
  });

  it("returns the same class summary from submission and a reloaded result", async () => {
    const { lesson } = await createLessonFixture();
    const questions = await prisma.question.findMany({
      where: { lessonId: lesson.id, mode: "QUESTIONNAIRE" },
      orderBy: { position: "asc" },
    });

    for (const [name, normalizedName, percentage] of [
      ["Nikos", "nikos", 60],
      ["Eleni", "eleni", 20],
    ] as const) {
      await prisma.attempt.create({
        data: {
          lessonId: lesson.id,
          studentName: name,
          normalizedStudentName: normalizedName,
          studentSchool: "Test School",
          mode: "QUESTIONNAIRE",
          locale: "el",
          score: Math.round((percentage / 100) * questions.length),
          maxScore: questions.length,
          percentage,
          passed: percentage >= 60,
          durationMs: 1000,
          completedAt: new Date(),
        },
      });
    }

    const submitted = await questionnaire.submitQuestionnaire({
      lessonId: lesson.id,
      studentName: "Maria",
      normalizedStudentName: "maria",
      studentSchool: "Test School",
      locale: "el",
      answers: questions.map((question) => ({ questionId: question.id, optionId: "a" })),
      durationMs: 1000,
      idempotencyKey: "class-summary-1",
      retakeEnabled: false,
      passThreshold: 60,
    });

    expect(submitted.result.classSummary).toEqual({
      attempts: 3,
      average: 60,
      highest: 100,
      lowest: 20,
      distribution: [
        { band: "0-19", count: 0 },
        { band: "20-39", count: 1 },
        { band: "40-59", count: 0 },
        { band: "60-79", count: 1 },
        { band: "80-100", count: 1 },
      ],
      currentBand: "80-100",
    });

    const loaded = await lessonData.loadLessonForStudent({
      lessonId: lesson.id,
      locale: "el",
      token: "test-token",
      normalizedStudentName: "maria",
    });
    expect(loaded?.existingResult?.classSummary).toEqual(submitted.result.classSummary);

    const summaryPayload = JSON.stringify(submitted.result.classSummary);
    expect(summaryPayload).not.toContain("Maria");
    expect(summaryPayload).not.toContain("maria");
    expect(summaryPayload).not.toContain("Nikos");
    expect(summaryPayload).not.toContain("nikos");
    expect(summaryPayload).not.toContain("Eleni");
    expect(summaryPayload).not.toContain("eleni");
    expect(summaryPayload).not.toContain("attemptId");
    expect(summaryPayload).not.toContain("studentName");
    expect(summaryPayload).not.toContain("normalizedStudentName");
    expect(summaryPayload).not.toContain("answers");
    expect(Object.keys(submitted.result.classSummary ?? {}).sort()).toEqual(
      ["attempts", "average", "currentBand", "distribution", "highest", "lowest"].sort(),
    );
  });
});

describe("millionaire game", () => {
  it("never exposes answer keys in active state and supports lifelines, resume, and review", async () => {
    const { lesson } = await createLessonFixture();
    const started = await game.startGame({
      lessonId: lesson.id,
      studentName: "Maria",
      normalizedStudentName: "maria",
      studentSchool: "Test School",
      locale: "en",
    });
    expect(started.status).toBe("ACTIVE");
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: started.attemptId } })).studentSchool).toBe(
      "Test School",
    );
    const activeJson = JSON.stringify(started);
    expect(activeJson).not.toContain("correctOptionId");
    expect(activeJson).not.toContain("explanation");
    const firstQuestion = (started as Extract<typeof started, { status: "ACTIVE" }>).question!;

    const resumed = await game.startGame({
      lessonId: lesson.id,
      studentName: "Maria",
      normalizedStudentName: "maria",
      studentSchool: "Test School",
      locale: "en",
    });
    expect(resumed.attemptId).toBe(started.attemptId);

    const lifeline = await game.consumeLifeline({
      attemptId: started.attemptId,
      lessonId: lesson.id,
      normalizedStudentName: "maria",
      lifeline: "fiftyFifty",
      locale: "en",
    });
    expect(lifeline.removedOptionIds?.length).toBe(2);
    await expect(
      game.consumeLifeline({
        attemptId: started.attemptId,
        lessonId: lesson.id,
        normalizedStudentName: "maria",
        lifeline: "fiftyFifty",
        locale: "en",
      }),
    ).rejects.toMatchObject({ code: "lifeline_used" });

    const correct = await game.answerGame({
      attemptId: started.attemptId,
      lessonId: lesson.id,
      normalizedStudentName: "maria",
      questionId: firstQuestion.id,
      optionId: "a",
      locale: "en",
    });
    expect(correct.result.isCorrect).toBe(true);
    expect(correct.state.status).toBe("ACTIVE");
    expect(correct.state.score).toBe(1);

    const second = (correct.state as Extract<typeof correct.state, { status: "ACTIVE" }>).question!;
    const wrong = await game.answerGame({
      attemptId: started.attemptId,
      lessonId: lesson.id,
      normalizedStudentName: "maria",
      questionId: second.id,
      optionId: "b",
      locale: "en",
    });
    expect(wrong.state.status).toBe("ENDED");
    if (wrong.state.status === "ENDED") {
      expect(wrong.state.score).toBe(1);
      expect(wrong.state.review).toHaveLength(2);
      expect(wrong.state.review[1].correctOptionId).toBe("a");
    }
  });

  it("expires an abandoned session and starts a new one", async () => {
    const { lesson } = await createLessonFixture();
    const started = await game.startGame({
      lessonId: lesson.id,
      studentName: "Eleni",
      normalizedStudentName: "eleni",
      studentSchool: "Test School",
      locale: "el",
    });
    await prisma.attempt.update({
      where: { id: started.attemptId },
      data: { lastActivityAt: new Date(Date.now() - 5 * 60 * 60 * 1000) },
    });
    const restarted = await game.startGame({
      lessonId: lesson.id,
      studentName: "Eleni",
      normalizedStudentName: "eleni",
      studentSchool: "Test School",
      locale: "el",
    });
    expect(restarted.attemptId).not.toBe(started.attemptId);
    expect((await prisma.attempt.findUniqueOrThrow({ where: { id: started.attemptId } })).gameStatus).toBe("ENDED");
  });
});

describe("millionaire game start errors", () => {
  it("rejects a lesson that is not ready", async () => {
    const { lesson } = await createLessonFixture();
    await prisma.lesson.update({ where: { id: lesson.id }, data: { status: "GENERATING" } });

    await expect(
      game.startGame({
        lessonId: lesson.id,
        studentName: "Maria",
        normalizedStudentName: "maria",
        studentSchool: "Test School",
        locale: "el",
      }),
    ).rejects.toMatchObject({ code: "not_ready" });
  });

  it("rejects a ready lesson with no game questions", async () => {
    const { lesson } = await createLessonFixture();
    await prisma.question.deleteMany({ where: { lessonId: lesson.id, mode: "GAME" } });

    await expect(
      game.startGame({
        lessonId: lesson.id,
        studentName: "Maria",
        normalizedStudentName: "maria",
        studentSchool: "Test School",
        locale: "el",
      }),
    ).rejects.toMatchObject({ code: "no_game" });
  });

  it("requires a matching student session on the start route", async () => {
    const { lesson } = await createLessonFixture();
    const link = await share.createShareLink({ lessonId: lesson.id });

    const response = await gameStartRoute.POST(
      new Request(`http://localhost:3000/api/s/${link.token}/lessons/${lesson.id}/game/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale: "el" }),
      }),
      { params: Promise.resolve({ token: link.token, lessonId: lesson.id }) },
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "unauthorized" } });
    expect(await prisma.attempt.count({ where: { lessonId: lesson.id, mode: "GAME" } })).toBe(0);
  });
});

describe("student content", () => {
  it("exposes only approved resources in stable order", async () => {
    const { lesson } = await createLessonFixture();
    await prisma.lessonResource.createMany({
      data: [
        {
          lessonId: lesson.id,
          kind: "LINK",
          status: "APPROVED",
          source: "MANUAL",
          title: "Second",
          description: "Second description",
          url: "https://example.com/second",
          fingerprint: `student-resource-second-${lesson.id}`,
          position: 2,
        },
        {
          lessonId: lesson.id,
          kind: "YOUTUBE",
          status: "APPROVED",
          source: "TEXT",
          title: "First",
          url: "https://youtu.be/dQw4w9WgXcQ",
          youtubeId: "dQw4w9WgXcQ",
          sourcePage: 1,
          fingerprint: `student-resource-first-${lesson.id}`,
          position: 1,
        },
        {
          lessonId: lesson.id,
          kind: "LINK",
          status: "SUGGESTED",
          source: "QR",
          title: "Suggested",
          url: "https://example.com/suggested",
          fingerprint: `student-resource-suggested-${lesson.id}`,
          position: 3,
        },
        {
          lessonId: lesson.id,
          kind: "LINK",
          status: "DISMISSED",
          source: "ANNOTATION",
          title: "Dismissed",
          url: "https://example.com/dismissed",
          fingerprint: `student-resource-dismissed-${lesson.id}`,
          position: 4,
        },
      ],
    });

    const data = await lessonData.loadLessonForStudent({
      lessonId: lesson.id,
      locale: "en",
      token: "test-token",
      normalizedStudentName: "maria",
    });

    expect(data?.resources.map((resource) => resource.title)).toEqual(["First", "Second"]);
    expect(data?.resources[0]).toMatchObject({
      kind: "YOUTUBE",
      youtubeId: "dQw4w9WgXcQ",
      sourcePage: 1,
    });
    const serialized = JSON.stringify(data?.resources);
    expect(serialized).not.toContain("fingerprint");
    expect(serialized).not.toContain("SUGGESTED");
    expect(serialized).not.toContain("DISMISSED");
  });

  it("does not expose questionnaire answer keys and falls back to the primary locale", async () => {
    const { lesson } = await createLessonFixture({ includeEnglish: false });
    const data = await lessonData.loadLessonForStudent({
      lessonId: lesson.id,
      locale: "en",
      token: "test-token",
      normalizedStudentName: "maria",
    });
    expect(data?.fallbackUsed).toBe(true);
    expect(data?.questionnaire[0].prompt).toContain("Ερώτηση");
    expect(JSON.stringify(data?.questionnaire)).not.toContain("correctOptionId");
    expect(JSON.stringify(data?.questionnaire)).not.toContain("explanation");
  });
});
