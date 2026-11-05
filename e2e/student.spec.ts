import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

async function makePdf(filePath: string, title: string) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < 2; index += 1) {
    const page = document.addPage([600, 400]);
    page.drawText(`${title} page ${index + 1}`, { x: 40, y: 340, size: 18, font });
    page.drawText("Photosynthesis converts light energy into chemical energy.", { x: 40, y: 300, size: 13, font });
    page.drawText("Plants use chlorophyll to absorb light. Mitochondria produce ATP.", { x: 40, y: 270, size: 13, font });
  }
  await writeFile(filePath, await document.save());
}

test("students can learn, play, and be assessed from a share link", async ({ page }) => {
  test.setTimeout(120_000);
  const suffix = Date.now().toString(36);
  const dir = await mkdtemp(path.join(os.tmpdir(), "lessonlab-student-e2e-"));
  const pdfPath = path.join(dir, `${suffix}-lesson.pdf`);
  await makePdf(pdfPath, `Student lesson ${suffix}`);

  await page.goto("/el/login");
  await page.getByLabel("Κωδικός πρόσβασης").fill("change-me");
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/el\/admin/);

  const className = `Student class ${suffix}`;
  await page.getByTestId("new-class-name").fill(className);
  await page.getByTestId("create-class").click();
  await page.locator(`[data-class-name="${className}"]`).getByRole("link", { name: "Άνοιγμα τάξης" }).click();
  await expect(page).toHaveURL(/\/el\/admin\/classes\//);
  const classId = page.url().split("/").pop()!;

  await page.getByTestId("lesson-file-input").setInputFiles([pdfPath]);
  await expect(page.getByTestId("lesson-status")).toHaveAttribute("data-status", "READY", { timeout: 45_000 });

  await page.getByRole("link", { name: "Άνοιγμα μαθήματος" }).first().click();
  await expect(page).toHaveURL(/\/el\/admin\/lessons\//);
  await page.getByTestId("create-share-link").click();
  const shareUrl = await page.getByTestId("share-url").inputValue();
  expect(shareUrl).toContain("/el/s/");
  const shareToken = shareUrl.split("/s/")[1];

  const blankName = await page.request.post(`/api/s/${shareToken}/session`, { data: { name: "   " } });
  expect(blankName.status()).toBe(422);

  await page.goto(shareUrl);
  await expect(page.getByTestId("student-name")).toBeVisible();
  await page.getByTestId("student-name").fill(`Μαθήτρια ${suffix}`);
  await page.getByTestId("student-start").click();

  await expect(page).toHaveURL(/\/el\/s\/.+\/lesson\//);
  const lessonUrl = page.url();
  const token = lessonUrl.split("/s/")[1].split("/")[0];
  const lessonId = lessonUrl.split("/lesson/")[1];

  // Cards
  await page.getByTestId("tab-cards").click();
  await expect(page.getByTestId("card-deck")).toBeVisible();
  const firstCard = await page.getByTestId("card-text").textContent();
  await page.getByTestId("card-face").click();
  await expect(page.getByTestId("card-text")).not.toHaveText(firstCard ?? "");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("card-deck")).toContainText("Κάρτα 2");

  // No answer keys in the game payload
  const gameStart = await page.request.post(`/api/s/${token}/lessons/${lessonId}/game/start`, {
    data: { locale: "el" },
  });
  expect(gameStart.status()).toBe(200);
  const gameJson = await gameStart.text();
  expect(gameJson).not.toContain("correctOptionId");
  expect(gameJson).not.toContain("explanation");

  // Game
  await page.getByTestId("tab-game").click();
  await page.getByTestId("game-start").click();
  await expect(page.getByTestId("game-question")).toBeVisible();
  await page.getByRole("button", { name: "Σίγαση" }).click();
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("lessonlab:muted"))).toBe("1");
  await page.getByTestId("game-fifty").click();
  await expect(page.locator("[data-testid^=game-option-]")).toHaveCount(2);
  await page.getByTestId("game-option-a").click();
  await expect(page.getByTestId("game-score")).toContainText("1", { timeout: 10_000 });

  // Questionnaire
  await page.getByTestId("tab-quiz").click();
  await expect(page.getByTestId("quiz")).toBeVisible();
  page.on("dialog", (dialog) => dialog.accept());
  for (let index = 0; index < 25; index += 1) {
    if ((await page.getByTestId("quiz-question").count()) === 0) break;
    await page.getByTestId("quiz-option-a").click();
    const next = page.getByRole("button", { name: "Επόμενο" });
    if ((await next.count()) > 0) {
      await next.click();
    } else {
      break;
    }
  }
  await page.getByTestId("quiz-submit").first().click();
  await expect(page.getByTestId("quiz-result")).toBeVisible({ timeout: 15_000 });

  // Video
  await page.getByTestId("tab-video").click();
  await expect(page.getByTestId("video-player")).toBeVisible();

  // Locale switch keeps the lesson and tab
  await page.locator("select").first().selectOption("en");
  await expect(page).toHaveURL(/\/en\/s\/.+\/lesson\//);
  await expect(page.getByTestId("tab-cards")).toContainText("Cards");
  await expect(page.getByTestId("tab-quiz")).toContainText("Quiz");
  await expect(page.getByTestId("video-player")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("video-player")).toBeVisible();

  // Mobile layout
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 820, height: 1180 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.getByTestId("tab-game")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    expect(overflow).toBe(true);
  }

  // A returning browser is offered the stored name even after the session cookie is gone.
  await page.context().clearCookies({ name: "student_session" });
  await page.goto(shareUrl);
  await expect(page.getByTestId("student-name")).toHaveValue(`Μαθήτρια ${suffix}`);

  // Teacher cleanup (the teacher session from the start of the test is still valid)
  await page.goto("/el/admin");
  await expect(page).toHaveURL(/\/el\/admin/);
  await page.request.delete(`/api/admin/classes/${classId}`, { data: { confirm: true } });
});
