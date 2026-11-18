import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nextTestAccessCode } from "./helpers/access-code";
import type { PrismaClient } from "@prisma/client";
import { startTestInfra, type TestInfra } from "./helpers/infra";
import { resetEnvCache } from "@/lib/env";
import { rubricUpdateSchema } from "@/lib/rubric";

let infra: TestInfra;
let prisma: PrismaClient;
let rubricService: typeof import("@/server/services/rubric");
let rubricRoute: typeof import("@/app/api/admin/lessons/[lessonId]/rubric/route");
let cookie: string;

beforeAll(async () => {
  infra = await startTestInfra();
  process.env.DATABASE_URL = infra.databaseUrl;
  process.env.AUTH_SECRET = "a".repeat(40);
  process.env.TEACHER_PASSWORD = "test";
  resetEnvCache();

  prisma = (await import("@/server/db")).prisma;
  rubricService = await import("@/server/services/rubric");
  rubricRoute = await import("@/app/api/admin/lessons/[lessonId]/rubric/route");
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

function patchRubric(lessonId: string, body: unknown, options?: { auth?: boolean; origin?: string | null }) {
  return rubricRoute.PATCH(
    request(`/api/admin/lessons/${lessonId}/rubric`, { method: "PATCH", body: JSON.stringify(body) }, options),
    { params: Promise.resolve({ lessonId }) },
  );
}

function text(prefix: string) {
  return { el: `${prefix} EL`, en: `${prefix} EN` };
}

function rubric() {
  return {
    criteria: [1, 2, 3].map((index) => ({
      id: `criterion-${index}`,
      title: text(`Criterion ${index}`),
      description: text(`Description ${index}`),
    })),
    levels: [1, 2, 3].map((index) => ({
      id: `level-${index}`,
      label: text(`Level ${index}`),
      description: text(`Level description ${index}`),
    })),
  };
}

let sequence = 0;
async function createLesson() {
  sequence += 1;
  const classroom = await prisma.class.create({ data: { name: `Rubric ${sequence}-${Date.now()}` } });
  return prisma.lesson.create({
    data: {
      classId: classroom.id,
      accessCode: nextTestAccessCode(),
      title: `Rubric lesson ${sequence}`,
      originalFilename: `rubric-${sequence}.pdf`,
      storageKey: `lessons/rubric-${sequence}/original.pdf`,
      checksum: `rubric-checksum-${sequence}-${Math.random()}`,
      sizeBytes: 100,
      pageCount: 2,
      sourceLocale: "en",
      status: "READY",
    },
  });
}

describe("lesson rubric service and route", () => {
  it("saves, normalizes, reads, and clears a rubric", async () => {
    const lesson = await createLesson();
    const input = rubric();
    input.criteria[0].title.el = "  Κριτήριο 1  ";

    const saved = await rubricService.updateLessonRubric(lesson.id, input);
    expect(saved?.criteria[0].title.el).toBe("Κριτήριο 1");
    await expect(rubricService.getLessonRubric(lesson.id)).resolves.toEqual(saved);

    const stored = await prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(stored.rubricEdited).toBe(true);

    const cleared = await rubricService.updateLessonRubric(lesson.id, { criteria: [], levels: [] });
    expect(cleared).toBeNull();
    await expect(rubricService.getLessonRubric(lesson.id)).resolves.toBeNull();
    const clearedStored = await prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(clearedStored.rubric).toBeNull();
  });

  it("rejects invalid edits without changing stored values", async () => {
    const lesson = await createLesson();
    await rubricService.updateLessonRubric(lesson.id, rubric());

    const invalidBodies = [
      { criteria: [], levels: rubric().levels },
      { ...rubric(), criteria: rubric().criteria.slice(0, 2) },
      { ...rubric(), levels: rubric().levels.slice(0, 2) },
      { ...rubric(), criteria: [{ ...rubric().criteria[0], title: { el: "", en: "x" } }, ...rubric().criteria.slice(1)] },
    ];
    const duplicate = rubric();
    duplicate.criteria[1].id = duplicate.criteria[0].id;
    invalidBodies.push(duplicate);

    for (const body of invalidBodies) {
      const response = await patchRubric(lesson.id, body);
      expect(response.status).toBe(422);
    }

    const stored = await prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(stored.rubric).toMatchObject({ criteria: expect.any(Array), levels: expect.any(Array) });
    expect((stored.rubric as { criteria: unknown[] }).criteria).toHaveLength(3);
  });

  it("saves through the authenticated route", async () => {
    const lesson = await createLesson();
    const response = await patchRubric(lesson.id, rubric());
    expect(response.status).toBe(200);
    expect((await response.json()).rubric.criteria).toHaveLength(3);
  });

  it("requires an authenticated teacher and rejects cross-origin mutations", async () => {
    const lesson = await createLesson();
    const unauthorized = await patchRubric(lesson.id, rubric(), { auth: false });
    expect(unauthorized.status).toBe(401);

    const crossOrigin = await patchRubric(lesson.id, rubric(), { origin: "https://evil.example" });
    expect(crossOrigin.status).toBe(401);

    const stored = await prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(stored.rubric).toBeNull();
  });

  it("keeps the update schema aligned with the shared limits", () => {
    expect(rubricUpdateSchema.parse(rubric()).criteria).toHaveLength(3);
  });
});
