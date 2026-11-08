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

test("teacher can edit deck card content in both locales", async ({ page }) => {
  test.setTimeout(120_000);
  const suffix = Date.now().toString(36);
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl() } } });

  const greekPrompt = `Επεξεργασμένη ερώτηση ${suffix}`;
  const greekAnswer = `Επεξεργασμένη απάντηση ${suffix}`;
  const englishPrompt = `Edited prompt ${suffix}`;
  const englishAnswer = `Edited answer ${suffix}`;

  try {
    const classroom = await prisma.class.create({ data: { name: `Card editing class ${suffix}` } });
    const lesson = await prisma.lesson.create({
      data: {
        classId: classroom.id,
        title: `Card editing lesson ${suffix}`,
        originalFilename: `card-editing-${suffix}.pdf`,
        storageKey: `lessons/card-editing-${suffix}/original.pdf`,
        checksum: `card-editing-checksum-${suffix}`,
        sizeBytes: 100,
        pageCount: 1,
        sourceLocale: "el",
        status: "READY",
        readyAt: new Date(),
      },
    });
    await prisma.card.create({
      data: {
        lessonId: lesson.id,
        itemKey: "card-1",
        position: 1,
        sourcePage: 1,
        translations: {
          create: [
            { locale: "el", prompt: "Αρχική ερώτηση", answer: "Αρχική απάντηση" },
            { locale: "en", prompt: "Initial prompt", answer: "Initial answer" },
          ],
        },
      },
    });

    await page.goto("/el/login");
    await page.getByLabel("Κωδικός πρόσβασης").fill("change-me");
    await page.getByTestId("login-submit").click();
    await expect(page).toHaveURL(/\/el\/admin/);

    await page.goto(`/el/admin/lessons/${lesson.id}`);
    await expect(page.getByRole("heading", { name: lesson.title })).toBeVisible();

    // The editor is available for a ready lesson and warns about regeneration.
    await expect(page.getByTestId("card-editor")).toBeVisible();
    await expect(page.getByTestId("card-editor")).toContainText("Η επαναδημιουργία μαθήματος αντικαθιστά την τράπουλα");
    await expect(page.getByTestId("card-0-el-prompt")).toHaveValue("Αρχική ερώτηση");

    await page.getByTestId("card-0-el-prompt").fill(greekPrompt);
    await page.getByTestId("card-0-el-answer").fill(greekAnswer);
    await page.getByTestId("card-0-en-prompt").fill(englishPrompt);
    await page.getByTestId("card-0-en-answer").fill(englishAnswer);
    await page.getByTestId("card-save-0").click();
    await expect(page.getByText("Η κάρτα αποθηκεύτηκε.")).toBeVisible({ timeout: 15_000 });

    // Persisted in the editor after a reload.
    await page.reload();
    await expect(page.getByTestId("card-0-el-prompt")).toHaveValue(greekPrompt);
    await expect(page.getByTestId("card-0-el-answer")).toHaveValue(greekAnswer);
    await expect(page.getByTestId("card-0-en-prompt")).toHaveValue(englishPrompt);
    await expect(page.getByTestId("card-0-en-answer")).toHaveValue(englishAnswer);

    // Students see the edited text on their next deck load without regeneration.
    await page.getByTestId("create-share-link").click();
    const shareUrl = await page.getByTestId("share-url").inputValue();
    expect(shareUrl).toContain("/el/s/");

    await page.goto(shareUrl);
    await page.getByTestId("student-name").fill(`Μαθήτρια ${suffix}`);
    await page.getByTestId("student-start").click();
    await expect(page).toHaveURL(/\/el\/s\/.+\/lesson\//);
    await page.getByTestId("tab-cards").click();
    await expect(page.getByTestId("card-deck")).toBeVisible();
    await expect(page.getByTestId("card-text")).toHaveText(greekPrompt);
    await page.getByTestId("card-face").click();
    await expect(page.getByTestId("card-text")).toHaveText(greekAnswer);
  } finally {
    await prisma.lesson.deleteMany({ where: { title: `Card editing lesson ${suffix}` } }).catch(() => undefined);
    await prisma.class.deleteMany({ where: { name: `Card editing class ${suffix}` } }).catch(() => undefined);
    await prisma.$disconnect();
  }
});
