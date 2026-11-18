import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { nextTestAccessCode } from "./helpers/access-code";
import type { PrismaClient } from "@prisma/client";
import { startTestInfra, type TestInfra } from "./helpers/infra";
import { resetEnvCache } from "@/lib/env";

let infra: TestInfra;
let prisma: PrismaClient;
let route: typeof import("@/app/api/admin/lessons/[lessonId]/resource-suggestions/route");
let cookie: string;

beforeAll(async () => {
  infra = await startTestInfra();
  process.env.DATABASE_URL = infra.databaseUrl;
  process.env.AUTH_SECRET = "a".repeat(40);
  process.env.TEACHER_PASSWORD = "test";
  process.env.AI_PROVIDER = "mock";
  process.env.OPENAI_API_KEY = "test-key";
  resetEnvCache();

  prisma = (await import("@/server/db")).prisma;
  route = await import("@/app/api/admin/lessons/[lessonId]/resource-suggestions/route");
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
  return new Request(`http://localhost:3000${pathname}`, { ...init, headers });
}

function postSuggestions(
  lessonId: string,
  options?: { auth?: boolean; origin?: string | null },
) {
  return route.POST(
    request(`/api/admin/lessons/${lessonId}/resource-suggestions`, { method: "POST" }, options),
    { params: Promise.resolve({ lessonId }) },
  );
}

let sequence = 0;
async function createLesson() {
  sequence += 1;
  const classroom = await prisma.class.create({ data: { name: `Suggestions ${sequence}-${Date.now()}` } });
  const lesson = await prisma.lesson.create({
    data: {
      classId: classroom.id,
      accessCode: nextTestAccessCode(),
      title: `Biology ${sequence}`,
      originalFilename: `suggestions-${sequence}.pdf`,
      storageKey: `lessons/suggestions-${sequence}/original.pdf`,
      checksum: `suggestions-checksum-${sequence}-${Math.random()}`,
      sizeBytes: 100,
      pageCount: 2,
      sourceLocale: "en",
      topics: { el: ["Φωτοσύνθεση"], en: ["Photosynthesis"] },
      status: "READY",
    },
  });
  await prisma.lessonPage.createMany({
    data: [
      { lessonId: lesson.id, pageNumber: 1, text: "Photosynthesis converts light into chemical energy." },
      { lessonId: lesson.id, pageNumber: 2, text: "Plants use chlorophyll to absorb light." },
    ],
  });
  return lesson;
}

describe("AI resource suggestion route", () => {
  it("stores mock AI proposals as suggested resources", async () => {
    const lesson = await createLesson();
    const response = await postSuggestions(lesson.id);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.created).toBeGreaterThan(0);
    expect(body.resources[0]).toMatchObject({
      source: "AI",
      status: "SUGGESTED",
    });

    const stored = await prisma.lessonResource.findMany({ where: { lessonId: lesson.id } });
    expect(stored).toHaveLength(body.created);
    expect(stored.every((resource) => resource.source === "AI")).toBe(true);
  });

  it("requires an authenticated teacher and rejects cross-origin mutations", async () => {
    const lesson = await createLesson();
    const unauthorized = await postSuggestions(lesson.id, { auth: false });
    expect(unauthorized.status).toBe(401);

    const crossOrigin = await postSuggestions(lesson.id, { origin: "https://evil.example" });
    expect(crossOrigin.status).toBe(401);
    expect(await prisma.lessonResource.count({ where: { lessonId: lesson.id } })).toBe(0);
  });

  it("reports the resource limit conflict", async () => {
    const lesson = await createLesson();
    await prisma.lessonResource.createMany({
      data: Array.from({ length: 50 }, (_, index) => ({
        lessonId: lesson.id,
        kind: "LINK" as const,
        status: "SUGGESTED" as const,
        source: "TEXT" as const,
        title: `Existing ${index}`,
        url: `https://example.com/existing-${index}`,
        fingerprint: `existing-${lesson.id}-${index}`,
        position: index + 1,
      })),
    });

    const response = await postSuggestions(lesson.id);
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("resource_limit_reached");
    expect(await prisma.lessonResource.count({ where: { lessonId: lesson.id } })).toBe(50);
  });

  it("reports a provider failure without creating resources", async () => {
    const lesson = await createLesson();
    process.env.AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "test-key";
    resetEnvCache();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("upstream down")));

    try {
      const response = await postSuggestions(lesson.id);
      expect(response.status).toBe(500);
      expect(await prisma.lessonResource.count({ where: { lessonId: lesson.id } })).toBe(0);
    } finally {
      vi.unstubAllGlobals();
      process.env.AI_PROVIDER = "mock";
      resetEnvCache();
    }
  });
});
