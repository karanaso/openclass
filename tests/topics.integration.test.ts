import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nextTestAccessCode } from "./helpers/access-code";
import type { PrismaClient } from "@prisma/client";
import { startTestInfra, type TestInfra } from "./helpers/infra";
import { resetEnvCache } from "@/lib/env";

let infra: TestInfra;
let prisma: PrismaClient;
let topicsService: typeof import("@/server/services/topics");
let topicsRoute: typeof import("@/app/api/admin/lessons/[lessonId]/topics/route");
let cookie: string;

beforeAll(async () => {
  infra = await startTestInfra();
  process.env.DATABASE_URL = infra.databaseUrl;
  process.env.AUTH_SECRET = "a".repeat(40);
  process.env.TEACHER_PASSWORD = "test";
  resetEnvCache();

  prisma = (await import("@/server/db")).prisma;
  topicsService = await import("@/server/services/topics");
  topicsRoute = await import("@/app/api/admin/lessons/[lessonId]/topics/route");
  const session = await import("@/server/auth/session");
  cookie = await session.createSessionToken();
}, 180_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await infra?.stop();
});

function request(pathname: string, init: RequestInit = {}, options: { auth?: boolean; origin?: string | null } = {}) {
  const headers = new Headers(init.headers);
  if (options.auth !== false) headers.set("cookie", `teacher_session=${cookie}`);
  const origin = options.origin === undefined ? "http://localhost:3000" : options.origin;
  if (origin) headers.set("origin", origin);
  if (init.body) headers.set("content-type", "application/json");
  return new Request(`http://localhost:3000${pathname}`, { ...init, headers });
}

function patchTopics(
  lessonId: string,
  body: unknown,
  options?: { auth?: boolean; origin?: string | null },
) {
  return topicsRoute.PATCH(
    request(`/api/admin/lessons/${lessonId}/topics`, { method: "PATCH", body: JSON.stringify(body) }, options),
    { params: Promise.resolve({ lessonId }) },
  );
}

let sequence = 0;
async function createLesson() {
  sequence += 1;
  const classroom = await prisma.class.create({ data: { name: `Topics ${sequence}-${Date.now()}` } });
  return prisma.lesson.create({
    data: {
      classId: classroom.id,
      accessCode: nextTestAccessCode(),
      title: `Topics lesson ${sequence}`,
      originalFilename: `topics-${sequence}.pdf`,
      storageKey: `lessons/topics-${sequence}/original.pdf`,
      checksum: `topics-checksum-${sequence}-${Math.random()}`,
      sizeBytes: 100,
      pageCount: 2,
      sourceLocale: "en",
      status: "READY",
    },
  });
}

describe("lesson topics service and route", () => {
  it("saves, normalizes, and clears topics", async () => {
    const lesson = await createLesson();
    const saved = await topicsService.updateLessonTopics(lesson.id, {
      el: ["  Φωτοσύνθεση ", "Χλωροφύλλη"],
      en: [" Photosynthesis ", "Chlorophyll"],
    });
    expect(saved).toEqual({
      el: ["Φωτοσύνθεση", "Χλωροφύλλη"],
      en: ["Photosynthesis", "Chlorophyll"],
    });

    const stored = await prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(stored.topicsEdited).toBe(true);
    await expect(topicsService.getLessonTopics(lesson.id)).resolves.toEqual(saved);

    const cleared = await topicsService.updateLessonTopics(lesson.id, { el: [], en: [] });
    expect(cleared).toEqual({ el: [], en: [] });
  });

  it("rejects empty, duplicate, and oversized topics without changing stored values", async () => {
    const lesson = await createLesson();
    await topicsService.updateLessonTopics(lesson.id, { el: ["Αρχικό"], en: ["Original"] });

    for (const body of [
      { el: [""], en: [] },
      { el: ["Same", "same"], en: [] },
      { el: ["x".repeat(41)], en: [] },
      { el: Array.from({ length: 9 }, (_, index) => `Topic ${index}`), en: [] },
    ]) {
      const response = await patchTopics(lesson.id, body);
      expect(response.status).toBe(422);
    }

    await expect(topicsService.getLessonTopics(lesson.id)).resolves.toEqual({
      el: ["Αρχικό"],
      en: ["Original"],
    });
  });

  it("saves topics through the authenticated route", async () => {
    const lesson = await createLesson();
    const response = await patchTopics(lesson.id, { el: ["Θέμα"], en: ["Topic"] });
    expect(response.status).toBe(200);
    expect((await response.json()).topics).toEqual({ el: ["Θέμα"], en: ["Topic"] });
  });

  it("requires an authenticated teacher and rejects cross-origin mutations", async () => {
    const lesson = await createLesson();
    const unauthorized = await patchTopics(lesson.id, { el: ["A"], en: ["A"] }, { auth: false });
    expect(unauthorized.status).toBe(401);

    const crossOrigin = await patchTopics(
      lesson.id,
      { el: ["B"], en: ["B"] },
      { origin: "https://evil.example" },
    );
    expect(crossOrigin.status).toBe(401);

    const stored = await prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(stored.topics).toBeNull();
  });
});
