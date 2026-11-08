import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { startTestInfra, type TestInfra } from "./helpers/infra";
import { resetEnvCache } from "@/lib/env";
import { resetStorage, getStorage } from "@/server/storage";

let infra: TestInfra;
let prisma: PrismaClient;
let storageRoot: string;
let cookie: string;
let services: typeof import("@/server/services/classes");
let classesRoute: typeof import("@/app/api/admin/classes/route");
let classRoute: typeof import("@/app/api/admin/classes/[classId]/route");
let orderRoute: typeof import("@/app/api/admin/classes/order/route");
let lessonsRoute: typeof import("@/app/api/admin/classes/[classId]/lessons/route");
let lessonRoute: typeof import("@/app/api/admin/lessons/[lessonId]/route");

function request(pathname: string, init: RequestInit = {}, withAuth = true) {
  const headers = new Headers(init.headers);
  if (withAuth) headers.set("cookie", `teacher_session=${cookie}`);
  headers.set("origin", "http://localhost:3000");
  if (init.body) headers.set("content-type", "application/json");
  return new Request(`http://localhost:3000${pathname}`, { ...init, headers });
}

beforeAll(async () => {
  infra = await startTestInfra();
  storageRoot = await mkdtemp(path.join(os.tmpdir(), "lessonlab-classes-"));
  process.env.DATABASE_URL = infra.databaseUrl;
  process.env.AUTH_SECRET = "a".repeat(40);
  process.env.TEACHER_PASSWORD = "test";
  process.env.AI_PROVIDER = "mock";
  process.env.TTS_PROVIDER = "mock";
  process.env.STORAGE_ROOT = storageRoot;
  resetEnvCache();
  resetStorage();

  prisma = (await import("@/server/db")).prisma;
  services = await import("@/server/services/classes");
  classesRoute = await import("@/app/api/admin/classes/route");
  classRoute = await import("@/app/api/admin/classes/[classId]/route");
  orderRoute = await import("@/app/api/admin/classes/order/route");
  lessonsRoute = await import("@/app/api/admin/classes/[classId]/lessons/route");
  lessonRoute = await import("@/app/api/admin/lessons/[lessonId]/route");
  const session = await import("@/server/auth/session");
  cookie = await session.createSessionToken();
}, 120_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await rm(storageRoot, { recursive: true, force: true });
  await infra?.stop();
});

async function createLessonFor(classId: string, title: string, checksum: string) {
  return prisma.lesson.create({
    data: {
      classId,
      title,
      originalFilename: `${title}.pdf`,
      storageKey: `lessons/${title}/original.pdf`,
      checksum,
      sizeBytes: 100,
      pageCount: 1,
    },
  });
}

describe("class service", () => {
  it("rejects an empty class name", async () => {
    await expect(services.createClass({ name: "   " })).rejects.toThrow();
  });

  it("rejects an incomplete or duplicate order", async () => {
    const one = await services.createClass({ name: "Order A" });
    await services.createClass({ name: "Order B" });
    await expect(services.reorderClasses([one.id, one.id])).rejects.toThrow();
    await expect(services.reorderClasses([one.id])).rejects.toThrow();
    await expect(services.reorderClasses(["unknown"])).rejects.toThrow();
  });

  it("scopes lessons to their own class", async () => {
    const a = await services.createClass({ name: "Class A" });
    const b = await services.createClass({ name: "Class B" });
    const lessonA = await createLessonFor(a.id, "A lesson", "checksum-a");
    const lessonB = await createLessonFor(b.id, "B lesson", "checksum-b");

    const lessonsOfA = await services.listLessonsForClass(a.id);
    expect(lessonsOfA.map((lesson) => lesson.id)).toEqual([lessonA.id]);

    const detailA = await services.getLessonDetail(lessonA.id);
    const detailB = await services.getLessonDetail(lessonB.id);
    expect(detailA.classId).toBe(a.id);
    expect(detailB.classId).toBe(b.id);
  });

  it("renames a lesson, trims the title, and keeps the original filename", async () => {
    const classroom = await services.createClass({ name: "Rename service" });
    const lesson = await createLessonFor(classroom.id, "Rename source", "checksum-rename-service");

    const updated = await services.updateLessonTitle(lesson.id, { title: "  Renamed lesson  " });
    expect(updated.title).toBe("Renamed lesson");

    const stored = await prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(stored.title).toBe("Renamed lesson");
    expect(stored.originalFilename).toBe("Rename source.pdf");
  });

  it("rejects blank, overlong, and unknown lesson titles", async () => {
    const classroom = await services.createClass({ name: "Rename validation" });
    const lesson = await createLessonFor(classroom.id, "Validate source", "checksum-rename-validation");

    await expect(services.updateLessonTitle(lesson.id, { title: "   " })).rejects.toThrow();
    await expect(services.updateLessonTitle(lesson.id, { title: "x".repeat(201) })).rejects.toThrow();
    await expect(services.updateLessonTitle("missing", { title: "Valid" })).rejects.toMatchObject({
      code: "not_found",
    });

    const stored = await prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(stored.title).toBe("Validate source");
  });

  it("exposes an edited title to the student lesson data", async () => {
    const classroom = await services.createClass({ name: "Student title" });
    const lesson = await createLessonFor(classroom.id, "Student source", "checksum-student-title");
    await services.updateLessonTitle(lesson.id, { title: "Student-facing title" });

    const { loadLessonForStudent } = await import("@/server/student/lesson-data");
    const data = await loadLessonForStudent({
      lessonId: lesson.id,
      locale: "en",
      token: "test-token",
      normalizedStudentName: "student",
    });

    expect(data?.lesson.title).toBe("Student-facing title");
  });

  it("deletes a class, its lessons, and its files", async () => {
    const classroom = await services.createClass({ name: "Delete me" });
    const lesson = await createLessonFor(classroom.id, "Delete lesson", "checksum-delete");
    await getStorage().put(`lessons/${lesson.id}/original.pdf`, "pdf-bytes");
    expect(await getStorage().exists(`lessons/${lesson.id}/original.pdf`)).toBe(true);

    const result = await services.deleteClass(classroom.id);
    expect(result.deletedLessonIds).toContain(lesson.id);
    expect(await prisma.class.findUnique({ where: { id: classroom.id } })).toBeNull();
    expect(await prisma.lesson.findUnique({ where: { id: lesson.id } })).toBeNull();
    expect(await getStorage().exists(`lessons/${lesson.id}/original.pdf`)).toBe(false);
  });
});

describe("class APIs", () => {
  it("creates and lists classes", async () => {
    const created = await classesRoute.POST(
      request("/api/admin/classes", { method: "POST", body: JSON.stringify({ name: "API class" }) }),
    );
    expect(created.status).toBe(201);

    const list = await classesRoute.GET(request("/api/admin/classes"));
    expect(list.status).toBe(200);
    const body = await list.json();
    expect(body.classes.some((item: { name: string }) => item.name === "API class")).toBe(true);
  });

  it("rejects empty names and invalid order payloads", async () => {
    const empty = await classesRoute.POST(
      request("/api/admin/classes", { method: "POST", body: JSON.stringify({ name: "  " }) }),
    );
    expect(empty.status).toBe(422);

    const invalid = await orderRoute.PUT(
      request("/api/admin/classes/order", { method: "PUT", body: JSON.stringify({ ids: ["x", "x"] }) }),
    );
    expect(invalid.status).toBe(422);
  });

  it("lists only the requested class's lessons", async () => {
    const a = await services.createClass({ name: "API scope A" });
    const b = await services.createClass({ name: "API scope B" });
    await createLessonFor(a.id, "Scoped A", "checksum-scope-a");
    await createLessonFor(b.id, "Scoped B", "checksum-scope-b");

    const response = await lessonsRoute.GET(
      request(`/api/admin/classes/${a.id}/lessons`),
      { params: Promise.resolve({ classId: a.id }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.lessons).toHaveLength(1);
    expect(body.lessons[0].title).toBe("Scoped A");
  });

  it("renames a lesson through the API, trims the title, and keeps the original filename", async () => {
    const classroom = await services.createClass({ name: "API rename" });
    const lesson = await createLessonFor(classroom.id, "API rename source", "checksum-api-rename");

    const response = await lessonRoute.PATCH(
      request(`/api/admin/lessons/${lesson.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: "  API renamed  " }),
      }),
      { params: Promise.resolve({ lessonId: lesson.id }) },
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.lesson.title).toBe("API renamed");

    const stored = await prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(stored.title).toBe("API renamed");
    expect(stored.originalFilename).toBe("API rename source.pdf");
  });

  it("rejects invalid lesson renames and unknown lessons", async () => {
    const classroom = await services.createClass({ name: "API rename validation" });
    const lesson = await createLessonFor(classroom.id, "API validate source", "checksum-api-validate");
    const params = { params: Promise.resolve({ lessonId: lesson.id }) };

    const blank = await lessonRoute.PATCH(
      request(`/api/admin/lessons/${lesson.id}`, { method: "PATCH", body: JSON.stringify({ title: "   " }) }),
      params,
    );
    expect(blank.status).toBe(422);

    const overlong = await lessonRoute.PATCH(
      request(`/api/admin/lessons/${lesson.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: "x".repeat(201) }),
      }),
      params,
    );
    expect(overlong.status).toBe(422);

    const missing = await lessonRoute.PATCH(
      request("/api/admin/lessons/missing", { method: "PATCH", body: JSON.stringify({ title: "Valid" }) }),
      { params: Promise.resolve({ lessonId: "missing" }) },
    );
    expect(missing.status).toBe(404);

    const stored = await prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(stored.title).toBe("API validate source");
  });

  it("requires authentication and same-origin for lesson renames", async () => {
    const classroom = await services.createClass({ name: "API rename auth" });
    const lesson = await createLessonFor(classroom.id, "API auth source", "checksum-api-auth");
    const params = { params: Promise.resolve({ lessonId: lesson.id }) };

    const anonymous = await lessonRoute.PATCH(
      request(`/api/admin/lessons/${lesson.id}`, { method: "PATCH", body: JSON.stringify({ title: "Nope" }) }, false),
      params,
    );
    expect(anonymous.status).toBe(401);

    const crossOrigin = await lessonRoute.PATCH(
      new Request(`http://localhost:3000/api/admin/lessons/${lesson.id}`, {
        method: "PATCH",
        headers: {
          cookie: `teacher_session=${cookie}`,
          origin: "https://evil.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({ title: "Nope" }),
      }),
      params,
    );
    expect(crossOrigin.status).toBe(401);

    const stored = await prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(stored.title).toBe("API auth source");
  });

  it("requires authentication and same-origin mutations", async () => {
    const anonymous = await classesRoute.GET(request("/api/admin/classes", {}, false));
    expect(anonymous.status).toBe(401);

    const crossOrigin = await classesRoute.POST(
      new Request("http://localhost:3000/api/admin/classes", {
        method: "POST",
        headers: { cookie: `teacher_session=${cookie}`, origin: "https://evil.example", "content-type": "application/json" },
        body: JSON.stringify({ name: "Nope" }),
      }),
    );
    expect(crossOrigin.status).toBe(401);
  });

  it("deletes a class through the API with confirmation", async () => {
    const classroom = await services.createClass({ name: "API delete" });
    const withoutConfirm = await classRoute.DELETE(
      request(`/api/admin/classes/${classroom.id}`, { method: "DELETE", body: JSON.stringify({}) }),
      { params: Promise.resolve({ classId: classroom.id }) },
    );
    expect(withoutConfirm.status).toBe(422);

    const deleted = await classRoute.DELETE(
      request(`/api/admin/classes/${classroom.id}`, { method: "DELETE", body: JSON.stringify({ confirm: true }) }),
      { params: Promise.resolve({ classId: classroom.id }) },
    );
    expect(deleted.status).toBe(200);
    expect(await prisma.class.findUnique({ where: { id: classroom.id } })).toBeNull();
  });
});
