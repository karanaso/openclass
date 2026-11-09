import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

function envValue(key: string, fallback: string) {
  if (process.env[key]) return process.env[key]!;
  const envFile = readFileSync(".env", "utf8");
  const match = envFile.match(new RegExp(`^${key}=(.+)$`, "m"));
  return match ? match[1].trim() : fallback;
}

function databaseUrl() {
  return envValue("DATABASE_URL", "postgresql://lessonlab:lessonlab@localhost:5432/lessonlab");
}

function writeSolidPng(filePath: string, color: string) {
  execFileSync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=${color}:s=1536x1024:r=1`,
    "-frames:v",
    "1",
    filePath,
  ]);
}

test("teacher can preview and regenerate lesson artwork", async ({ page }) => {
  test.setTimeout(180_000);
  const suffix = Date.now().toString(36);
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl() } } });
  const storageRoot = path.resolve(envValue("STORAGE_ROOT", "./data"));
  let classroomId: string | undefined;
  let lessonId: string | undefined;

  try {
    const classroom = await prisma.class.create({ data: { name: `Artwork class ${suffix}` } });
    classroomId = classroom.id;
    const lesson = await prisma.lesson.create({
      data: {
        classId: classroom.id,
        title: `Artwork lesson ${suffix}`,
        originalFilename: `artwork-${suffix}.pdf`,
        storageKey: `lessons/artwork-${suffix}/original.pdf`,
        checksum: `artwork-${suffix}`,
        sizeBytes: 100,
        pageCount: 1,
        sourceLocale: "el",
        status: "READY",
        readyAt: new Date(),
      },
    });
    lessonId = lesson.id;
    await prisma.lessonPage.create({
      data: { lessonId: lesson.id, pageNumber: 1, text: "Photosynthesis and the water cycle." },
    });

    const legacyPrefix = `lessons/${lesson.id}/visual/legacy`;
    const oldSceneKey = `${legacyPrefix}/scene.png`;
    const oldCharacterKey = `${legacyPrefix}/character.png`;
    await mkdir(path.join(storageRoot, legacyPrefix), { recursive: true });
    writeSolidPng(path.join(storageRoot, oldSceneKey), "red");
    writeSolidPng(path.join(storageRoot, oldCharacterKey), "gray");

    await prisma.lessonVisual.create({
      data: {
        lessonId: lesson.id,
        status: "READY",
        jobVersion: lesson.jobVersion,
        promptVersion: "v2",
        sceneKey: oldSceneKey,
        characterSheetKey: oldCharacterKey,
        characterLoopKey: `${legacyPrefix}/character-loop.webm`,
        model: "legacy",
        imageQuality: "high",
      },
    });

    await page.goto("/el/login");
    await page.getByLabel("Κωδικός πρόσβασης").fill("change-me");
    await page.getByTestId("login-submit").click();
    await expect(page).toHaveURL(/\/el\/admin/);

    await page.goto(`/el/admin/lessons/${lesson.id}`);
    const scene = page.getByTestId("artwork-scene");
    const character = page.getByTestId("artwork-character");
    await expect(scene).toBeVisible();
    await expect(character).toBeVisible();

    const oldSrc = await scene.getAttribute("src");
    expect(oldSrc).toContain(`/api/admin/lessons/${lesson.id}/visual/scene`);
    const oldBytes = await (await page.request.get(oldSrc!)).body();

    await page.getByTestId("regenerate-artwork").click();

    await expect
      .poll(
        async () => {
          const visual = await prisma.lessonVisual.findUnique({ where: { lessonId: lesson.id } });
          return visual?.status === "READY" && visual.sceneKey !== oldSceneKey;
        },
        { timeout: 90_000, intervals: [1_000, 2_000, 3_000] },
      )
      .toBe(true);

    await page.reload();
    const newSrc = await page.getByTestId("artwork-scene").getAttribute("src");
    expect(newSrc).toBeTruthy();
    expect(newSrc).not.toBe(oldSrc);

    const newResponse = await page.request.get(newSrc!);
    expect(newResponse.status()).toBe(200);
    expect(newResponse.headers()["content-type"]).toContain("image/png");
    const newBytes = await newResponse.body();
    expect(newBytes.length).toBeGreaterThan(0);
    expect(newBytes.equals(oldBytes)).toBe(false);

    const refreshed = await prisma.lessonVisual.findUniqueOrThrow({ where: { lessonId: lesson.id } });
    expect(refreshed.status).toBe("READY");
    expect(refreshed.lastError).toBeNull();
    expect(refreshed.sceneKey).not.toBe(oldSceneKey);
    expect(await prisma.lessonPage.count({ where: { lessonId: lesson.id } })).toBe(1);
  } finally {
    if (lessonId) {
      await rm(path.join(storageRoot, "lessons", lessonId), { recursive: true, force: true });
    }
    if (classroomId) {
      await prisma.class.delete({ where: { id: classroomId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }
});
