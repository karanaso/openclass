import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nextTestAccessCode } from "./helpers/access-code";
import type { PrismaClient } from "@prisma/client";
import { startTestInfra, type TestInfra } from "./helpers/infra";
import { resetEnvCache } from "@/lib/env";

let infra: TestInfra;
let prisma: PrismaClient;
let resourcesService: typeof import("@/server/services/resources");
let resourceRoute: typeof import("@/app/api/admin/lessons/[lessonId]/resources/route");
let resourceItemRoute: typeof import("@/app/api/admin/lessons/[lessonId]/resources/[resourceId]/route");
let cookie: string;

beforeAll(async () => {
  infra = await startTestInfra();
  process.env.DATABASE_URL = infra.databaseUrl;
  process.env.AUTH_SECRET = "a".repeat(40);
  process.env.TEACHER_PASSWORD = "test";
  resetEnvCache();

  prisma = (await import("@/server/db")).prisma;
  resourcesService = await import("@/server/services/resources");
  resourceRoute = await import("@/app/api/admin/lessons/[lessonId]/resources/route");
  resourceItemRoute = await import("@/app/api/admin/lessons/[lessonId]/resources/[resourceId]/route");
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

function postResource(lessonId: string, body: unknown, options?: { auth?: boolean; origin?: string | null }) {
  return resourceRoute.POST(
    request(`/api/admin/lessons/${lessonId}/resources`, { method: "POST", body: JSON.stringify(body) }, options),
    { params: Promise.resolve({ lessonId }) },
  );
}

function patchResource(
  lessonId: string,
  resourceId: string,
  body: unknown,
  options?: { auth?: boolean; origin?: string | null },
) {
  return resourceItemRoute.PATCH(
    request(
      `/api/admin/lessons/${lessonId}/resources/${resourceId}`,
      { method: "PATCH", body: JSON.stringify(body) },
      options,
    ),
    { params: Promise.resolve({ lessonId, resourceId }) },
  );
}

function deleteResource(
  lessonId: string,
  resourceId: string,
  options?: { auth?: boolean; origin?: string | null },
) {
  return resourceItemRoute.DELETE(
    request(`/api/admin/lessons/${lessonId}/resources/${resourceId}`, { method: "DELETE" }, options),
    { params: Promise.resolve({ lessonId, resourceId }) },
  );
}

let sequence = 0;

async function createLesson(status: "READY" | "GENERATING" = "READY") {
  sequence += 1;
  const classroom = await prisma.class.create({ data: { name: `Resources ${sequence}-${Date.now()}` } });
  return prisma.lesson.create({
    data: {
      classId: classroom.id,
      accessCode: nextTestAccessCode(),
      title: `Resource lesson ${sequence}`,
      originalFilename: `resources-${sequence}.pdf`,
      storageKey: `lessons/resources-${sequence}/original.pdf`,
      checksum: `resources-checksum-${sequence}-${Math.random()}`,
      sizeBytes: 100,
      pageCount: 2,
      sourceLocale: "en",
      status,
    },
  });
}

async function createSuggested(
  lessonId: string,
  input: { url: string; title?: string; source?: "TEXT" | "ANNOTATION" | "QR"; sourcePage?: number },
) {
  return prisma.lessonResource.create({
    data: {
      lessonId,
      kind: input.url.includes("youtu") ? "YOUTUBE" : "LINK",
      status: "SUGGESTED",
      source: input.source ?? "TEXT",
      sourcePage: input.sourcePage ?? 1,
      title: input.title ?? "Suggested resource",
      url: input.url,
      youtubeId: null,
      fingerprint: `test-${Math.random()}`,
      position: 1,
    },
  });
}

describe("resource service and admin routes", () => {
  it("creates an approved manual link and lists it", async () => {
    const lesson = await createLesson();
    const response = await postResource(lesson.id, {
      title: "Cell biology reference",
      description: "Extra reading",
      url: "https://example.com/cell-biology",
    });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.resource).toMatchObject({
      kind: "LINK",
      status: "APPROVED",
      source: "MANUAL",
      title: "Cell biology reference",
      description: "Extra reading",
      position: 1,
    });

    const listed = await resourcesService.listLessonResources(lesson.id);
    expect(listed.map((resource) => resource.id)).toEqual([body.resource.id]);
  });

  it("recognizes YouTube URLs and exposes the video id", async () => {
    const lesson = await createLesson();
    const response = await postResource(lesson.id, {
      title: "Video",
      url: "https://youtu.be/dQw4w9WgXcQ",
    });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.resource).toMatchObject({
      kind: "YOUTUBE",
      youtubeId: "dQw4w9WgXcQ",
      status: "APPROVED",
    });
  });

  it("rejects duplicate normalized URLs with a stable code", async () => {
    const lesson = await createLesson();
    await postResource(lesson.id, { title: "One", url: "https://example.com/page" });
    const response = await postResource(lesson.id, {
      title: "Two",
      url: "https://example.com/page?utm_source=news#section",
    });
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe("duplicate_resource");
  });

  it("validates title, description, and URL limits", async () => {
    const lesson = await createLesson();
    for (const body of [
      { title: "   ", url: "https://example.com" },
      { title: "Title", url: "https://example.com", description: "x".repeat(501) },
      { title: "Title", url: "javascript:alert(1)" },
      { title: "Title", url: `https://example.com/${"a".repeat(2000)}` },
    ]) {
      const response = await postResource(lesson.id, body);
      expect(response.status).toBe(422);
    }
  });

  it("edits fields without changing an approved status", async () => {
    const lesson = await createLesson();
    const created = await (await postResource(lesson.id, {
      title: "Before",
      url: "https://example.com/before",
    })).json();

    const response = await patchResource(lesson.id, created.resource.id, {
      title: "After",
      description: "Updated",
      url: "https://example.com/after",
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.resource).toMatchObject({
      title: "After",
      description: "Updated",
      url: "https://example.com/after",
      status: "APPROVED",
    });
  });

  it("keeps the previous values when an edit URL is invalid", async () => {
    const lesson = await createLesson();
    const created = await (await postResource(lesson.id, {
      title: "Stable",
      url: "https://example.com/stable",
    })).json();

    const response = await patchResource(lesson.id, created.resource.id, { url: "data:text/html,x" });
    expect(response.status).toBe(422);

    const stored = await prisma.lessonResource.findUniqueOrThrow({ where: { id: created.resource.id } });
    expect(stored.url).toBe("https://example.com/stable");
    expect(stored.title).toBe("Stable");
  });

  it("approves and dismisses suggestions", async () => {
    const lesson = await createLesson();
    const first = await createSuggested(lesson.id, { url: "https://example.com/one" });
    const second = await createSuggested(lesson.id, { url: "https://example.com/two", source: "QR" });

    const approved = await patchResource(lesson.id, first.id, { status: "APPROVED" });
    expect(approved.status).toBe(200);
    expect((await approved.json()).resource.status).toBe("APPROVED");

    const dismissed = await patchResource(lesson.id, second.id, { status: "DISMISSED" });
    expect(dismissed.status).toBe(200);
    expect((await dismissed.json()).resource.status).toBe("DISMISSED");

    const listed = await resourcesService.listLessonResources(lesson.id);
    expect(listed.map((resource) => resource.id)).toEqual([first.id]);
  });

  it("rejects status changes on already-reviewed resources", async () => {
    const lesson = await createLesson();
    const created = await (await postResource(lesson.id, {
      title: "Approved",
      url: "https://example.com/approved",
    })).json();

    const response = await patchResource(lesson.id, created.resource.id, { status: "DISMISSED" });
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("invalid_status");
  });

  it("deletes approved resources and refuses to delete suggestions", async () => {
    const lesson = await createLesson();
    const approved = await (await postResource(lesson.id, {
      title: "Delete me",
      url: "https://example.com/delete-me",
    })).json();
    const suggested = await createSuggested(lesson.id, { url: "https://example.com/suggested" });

    const refused = await deleteResource(lesson.id, suggested.id);
    expect(refused.status).toBe(409);

    const deleted = await deleteResource(lesson.id, approved.resource.id);
    expect(deleted.status).toBe(200);
    expect(await prisma.lessonResource.findUnique({ where: { id: approved.resource.id } })).toBeNull();
  });

  it("runs discovery insertion twice without duplicates and preserves review state", async () => {
    const lesson = await createLesson();
    const candidates = [
      { url: "https://example.com/discovered-one", title: "One", source: "TEXT" as const, sourcePage: 1 },
      { url: "https://youtu.be/dQw4w9WgXcQ", source: "QR" as const, sourcePage: 2 },
    ];

    const firstRun = await resourcesService.createSuggestedResources(lesson.id, candidates);
    expect(firstRun.created).toBe(2);

    const rows = await prisma.lessonResource.findMany({ where: { lessonId: lesson.id }, orderBy: { position: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows[0].status).toBe("SUGGESTED");
    expect(rows[1].kind).toBe("YOUTUBE");

    await resourcesService.updateResource(lesson.id, rows[0].id, { status: "APPROVED" });

    const secondRun = await resourcesService.createSuggestedResources(lesson.id, candidates);
    expect(secondRun.created).toBe(0);

    const after = await prisma.lessonResource.findMany({ where: { lessonId: lesson.id } });
    expect(after).toHaveLength(2);
    expect(after.find((row) => row.id === rows[0].id)?.status).toBe("APPROVED");
  });

  it("does not recreate a dismissed URL", async () => {
    const lesson = await createLesson();
    await resourcesService.createSuggestedResources(lesson.id, [
      { url: "https://example.com/dismissed", source: "TEXT", sourcePage: 1 },
    ]);
    const [row] = await prisma.lessonResource.findMany({ where: { lessonId: lesson.id } });
    await resourcesService.updateResource(lesson.id, row.id, { status: "DISMISSED" });

    const result = await resourcesService.createSuggestedResources(lesson.id, [
      { url: "https://example.com/dismissed", source: "TEXT", sourcePage: 1 },
    ]);
    expect(result.created).toBe(0);
    expect(await prisma.lessonResource.count({ where: { lessonId: lesson.id } })).toBe(1);
  });

  it("requires an authenticated teacher", async () => {
    const lesson = await createLesson();
    const response = await postResource(
      lesson.id,
      { title: "Unauthorized", url: "https://example.com/unauthorized" },
      { auth: false },
    );
    expect(response.status).toBe(401);
    expect(await prisma.lessonResource.count({ where: { lessonId: lesson.id } })).toBe(0);
  });

  it("rejects cross-origin mutations", async () => {
    const lesson = await createLesson();
    const response = await postResource(
      lesson.id,
      { title: "Cross origin", url: "https://example.com/cross-origin" },
      { origin: "https://evil.example" },
    );
    expect(response.status).toBe(401);
    expect(await prisma.lessonResource.count({ where: { lessonId: lesson.id } })).toBe(0);
  });

  it("allows manual resources for a lesson that is still generating", async () => {
    const lesson = await createLesson("GENERATING");
    const response = await postResource(lesson.id, {
      title: "Early resource",
      url: "https://example.com/early",
    });
    expect(response.status).toBe(201);
  });
});
