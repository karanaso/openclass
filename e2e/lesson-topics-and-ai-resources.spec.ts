import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envFile = readFileSync(".env", "utf8");
  const match = envFile.match(/^DATABASE_URL=(.+)$/m);
  if (!match) throw new Error("DATABASE_URL is not configured");
  return match[1].trim();
}

test("teacher edits topics, approves AI suggestions, and students see only approved resources", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const suffix = Date.now().toString(36);
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl() } } });
  const greekTopic = `ΜοναδικόΘέμα${suffix}`;

  try {
    const classroom = await prisma.class.create({ data: { name: `Topics class ${suffix}` } });
    const lesson = await prisma.lesson.create({
      data: {
        classId: classroom.id,
        accessCode: String(100000000 + Math.floor(Math.random() * 900000000)),
        title: `Topics lesson ${suffix}`,
        originalFilename: `topics-${suffix}.pdf`,
        storageKey: `lessons/topics-${suffix}/original.pdf`,
        checksum: `topics-checksum-${suffix}`,
        sizeBytes: 100,
        pageCount: 2,
        sourceLocale: "el",
        status: "READY",
        readyAt: new Date(),
      },
    });
    await prisma.lessonPage.createMany({
      data: [
        {
          lessonId: lesson.id,
          pageNumber: 1,
          text: "Η φωτοσύνθεση μετατρέπει το φως σε χημική ενέργεια. Τα φυτά χρησιμοποιούν χλωροφύλλη.",
        },
        {
          lessonId: lesson.id,
          pageNumber: 2,
          text: "Η κυτταρική αναπνοή απελευθερώνει ενέργεια από τη γλυκόζη.",
        },
      ],
    });

    await page.goto("/el/login");
    await page.getByLabel("Κωδικός πρόσβασης").fill("change-me");
    await page.getByTestId("login-submit").click();
    await expect(page).toHaveURL(/\/el\/admin/);

    await page.goto(`/el/admin/lessons/${lesson.id}`);
    await expect(page.getByTestId("lesson-topics-editor")).toBeVisible();

    await page.getByTestId("topic-input-el").fill(greekTopic);
    await page.getByTestId("topic-add-el").click();
    await page.getByTestId("topic-input-en").fill("Photosynthesis");
    await page.getByTestId("topic-add-en").click();
    await page.getByTestId("topic-save").click();
    await expect(page.getByText("Τα θέματα αποθηκεύτηκαν.")).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("suggest-resources").click();
    await expect(page.getByText("Photosynthesis: video overview")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Πρόταση AI · ελέγξτε πριν την έγκριση").first()).toBeVisible();
    await expect(page.getByText(/προτάσεις προστέθηκαν για έλεγχο/)).toBeVisible();

    await page.getByTestId("resource-approve-0").click();
    await expect(page.getByText("Δημοσιευμένες πηγές")).toBeVisible({ timeout: 15_000 });

    const stored = await prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(stored.topics).toMatchObject({ el: [greekTopic], en: ["Photosynthesis"] });
    expect(stored.topicsEdited).toBe(true);

    const aiResources = await prisma.lessonResource.findMany({
      where: { lessonId: lesson.id, source: "AI" },
      orderBy: { position: "asc" },
    });
    expect(aiResources.length).toBeGreaterThan(0);
    expect(aiResources.filter((resource) => resource.status === "APPROVED")).toHaveLength(1);

    await page.getByTestId("create-share-link").click();
    const shareUrl = await page.getByTestId("share-url").inputValue();
    await page.goto(shareUrl);
    await page.getByTestId("student-school").fill("Test school");
    await page.getByTestId("student-name").fill(`Μαθήτρια ${suffix}`);
    await page.getByTestId("student-start").click();
    await expect(page).toHaveURL(/\/el\/s\/.+\/lesson\//);

    await page.getByTestId("tab-resources").click();
    await expect(page.getByTestId("resource-list")).toBeVisible();
    await expect(page.getByText("Photosynthesis: video overview")).toBeVisible();
    await expect(page.getByText(greekTopic)).toHaveCount(0);
  } finally {
    await prisma.$disconnect();
  }
});
