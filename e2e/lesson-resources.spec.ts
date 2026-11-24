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

test("teacher publishes resources and students use the Resources tab", async ({ page }) => {
  test.setTimeout(120_000);
  const suffix = Date.now().toString(36);
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl() } } });

  const suggestedUrl = `https://example.com/suggested-${suffix}`;
  const manualUrl = `https://example.com/manual-${suffix}`;
  const videoId = "dQw4w9WgXcQ";

  try {
    const classroom = await prisma.class.create({ data: { name: `Resources class ${suffix}` } });
    const lesson = await prisma.lesson.create({
      data: {
        classId: classroom.id,
        accessCode: String(100000000 + Math.floor(Math.random() * 900000000)),
        title: `Resources lesson ${suffix}`,
        originalFilename: `resources-${suffix}.pdf`,
        storageKey: `lessons/resources-${suffix}/original.pdf`,
        checksum: `resources-checksum-${suffix}`,
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
            { locale: "el", prompt: "Ερώτηση", answer: "Απάντηση" },
            { locale: "en", prompt: "Question", answer: "Answer" },
          ],
        },
      },
    });
    await prisma.lessonResource.create({
      data: {
        lessonId: lesson.id,
        kind: "LINK",
        status: "SUGGESTED",
        source: "TEXT",
        sourcePage: 1,
        title: `Suggested ${suffix}`,
        url: suggestedUrl,
        fingerprint: `suggested-${suffix}`,
        position: 1,
      },
    });

    await page.goto("/el/login");
    await page.getByLabel("Κωδικός πρόσβασης").fill("change-me");
    await page.getByTestId("login-submit").click();
    await expect(page).toHaveURL(/\/el\/admin/);

    await page.goto(`/el/admin/lessons/${lesson.id}`);
    await expect(page.getByTestId("resource-manager")).toBeVisible();
    await expect(page.getByText(`Suggested ${suffix}`)).toBeVisible();

    const suggestionLink = page.getByTestId("resource-url-0");
    await expect(suggestionLink).toHaveAttribute("href", suggestedUrl);
    await expect(suggestionLink).toHaveAttribute("target", "_blank");
    await expect(suggestionLink).toHaveAttribute("rel", "noopener noreferrer");

    const visitSuggestion = page.getByTestId("resource-visit-0");
    await expect(visitSuggestion).toHaveAttribute("href", suggestedUrl);
    await expect(visitSuggestion).toHaveAttribute("target", "_blank");
    await expect(visitSuggestion).toHaveAttribute("rel", "noopener noreferrer");

    // Approve the extracted suggestion.
    await page.getByTestId("resource-approve-0").click();
    await expect(page.getByText("Δημοσιευμένες πηγές")).toBeVisible({ timeout: 15_000 });

    // Add a general link.
    await page.getByTestId("new-resource-title").fill(`Manual link ${suffix}`);
    await page.getByTestId("new-resource-url").fill(manualUrl);
    await page.getByTestId("new-resource-description").fill("Extra reading");
    await page.getByTestId("new-resource-save").click();
    await expect(page.getByText("Η πηγή προστέθηκε.")).toBeVisible({ timeout: 15_000 });

    // Add a YouTube video and verify the detected-kind hint.
    await page.getByTestId("new-resource-title").fill(`Lesson video ${suffix}`);
    await page.getByTestId("new-resource-url").fill(`https://youtu.be/${videoId}`);
    await expect(page.getByTestId("new-resource-hint")).toContainText("Βίντεο YouTube");
    await page.getByTestId("new-resource-save").click();
    await expect(page.getByText(`Lesson video ${suffix}`)).toBeVisible({ timeout: 15_000 });

    const stored = await prisma.lessonResource.findMany({
      where: { lessonId: lesson.id },
      orderBy: { position: "asc" },
    });
    expect(stored.map((resource) => resource.status)).toEqual(["APPROVED", "APPROVED", "APPROVED"]);
    expect(stored.map((resource) => resource.kind)).toEqual(["LINK", "LINK", "YOUTUBE"]);

    await page.getByTestId("create-share-link").click();
    const shareUrl = await page.getByTestId("share-url").inputValue();
    expect(shareUrl).toContain("/el/s/");

    await page.goto(shareUrl);
    await page.getByTestId("student-school").fill("Test school");
    await page.getByTestId("student-name").fill(`Μαθήτρια ${suffix}`);
    await page.getByTestId("student-start").click();
    await expect(page).toHaveURL(/\/el\/s\/.+\/lesson\//);

    const tabs = page.getByRole("tab");
    await expect(tabs).toHaveCount(2);
    await expect(tabs.nth(0)).toHaveAttribute("data-testid", "tab-cards");
    await expect(tabs.nth(1)).toHaveAttribute("data-testid", "tab-resources");

    await page.getByTestId("tab-resources").click();
    await expect(page.getByTestId("resource-list")).toBeVisible();
    await expect(page.getByText(`Suggested ${suffix}`)).toBeVisible();

    const suggestedLink = page.getByTestId("resource-link-0");
    await expect(suggestedLink).toHaveAttribute("href", suggestedUrl);
    await expect(suggestedLink).toHaveAttribute("target", "_blank");
    await expect(suggestedLink).toHaveAttribute("rel", "noopener noreferrer");

    await expect(page.getByTestId("resource-youtube-link-2")).toHaveAttribute(
      "href",
      `https://youtu.be/${videoId}`,
    );
    await page.getByTestId("resource-play-2").click();
    await expect(page.getByTestId("resource-iframe")).toHaveAttribute(
      "src",
      `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`,
    );
  } finally {
    await prisma.$disconnect();
  }
});
