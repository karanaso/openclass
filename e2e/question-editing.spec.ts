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

test("teacher can edit and create questionnaire and game questions", async ({ page }) => {
  test.setTimeout(120_000);
  const suffix = Date.now().toString(36);
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl() } } });

  const initialGreekPrompt = `Αρχική ερώτηση ερωτηματολογίου ${suffix}`;
  const initialEnglishPrompt = `Initial questionnaire question ${suffix}`;
  const editedGreekPrompt = `Ενημερωμένη ερώτηση ερωτηματολογίου ${suffix}`;
  const editedEnglishPrompt = `Updated questionnaire question ${suffix}`;
  const newGameGreekPrompt = `Νέα ερώτηση παιχνιδιού ${suffix}`;
  const newGameEnglishPrompt = `New game question ${suffix}`;

  try {
    const classroom = await prisma.class.create({ data: { name: `Question editing class ${suffix}` } });
    const lesson = await prisma.lesson.create({
      data: {
        classId: classroom.id,
        title: `Question editing lesson ${suffix}`,
        originalFilename: `question-editing-${suffix}.pdf`,
        storageKey: `lessons/question-editing-${suffix}/original.pdf`,
        checksum: `question-editing-checksum-${suffix}`,
        sizeBytes: 100,
        pageCount: 1,
        sourceLocale: "el",
        status: "READY",
        readyAt: new Date(),
      },
    });

    await prisma.question.create({
      data: {
        lessonId: lesson.id,
        mode: "QUESTIONNAIRE",
        itemKey: "questionnaire-1",
        position: 1,
        type: "TRUE_FALSE",
        correctOptionId: "b",
        sourcePage: 1,
        translations: {
          create: [
            {
              locale: "el",
              prompt: initialGreekPrompt,
              options: [
                { id: "a", text: "Σωστό" },
                { id: "b", text: "Λάθος" },
              ],
              explanation: "Αρχική εξήγηση.",
            },
            {
              locale: "en",
              prompt: initialEnglishPrompt,
              options: [
                { id: "a", text: "True" },
                { id: "b", text: "False" },
              ],
              explanation: "Initial explanation.",
            },
          ],
        },
      },
    });

    await prisma.question.create({
      data: {
        lessonId: lesson.id,
        mode: "GAME",
        itemKey: "game-1",
        position: 1,
        type: "TRUE_FALSE",
        correctOptionId: "a",
        sourcePage: 1,
        translations: {
          create: [
            {
              locale: "el",
              prompt: `Αρχική ερώτηση παιχνιδιού ${suffix}`,
              options: [
                { id: "a", text: "Σωστό" },
                { id: "b", text: "Λάθος" },
              ],
              explanation: "Αρχική εξήγηση παιχνιδιού.",
            },
            {
              locale: "en",
              prompt: `Initial game question ${suffix}`,
              options: [
                { id: "a", text: "True" },
                { id: "b", text: "False" },
              ],
              explanation: "Initial game explanation.",
            },
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

    // The Questions editor opens from Generated content and shows both modes.
    await expect(page.getByTestId("question-editor")).toHaveCount(0);
    await page.getByTestId("edit-questions-button").click();
    await expect(page.getByTestId("edit-questions-button")).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("question-editor")).toBeVisible();
    await expect(page.getByTestId("question-section-questionnaire")).toContainText("Ερωτηματολόγιο");
    await expect(page.getByTestId("question-section-game")).toContainText("Παιχνίδι");

    // Edit the questionnaire question in both locales.
    await expect(page.getByTestId("question-questionnaire-0-el-prompt")).toHaveValue(initialGreekPrompt);
    await page.getByTestId("question-questionnaire-0-el-prompt").fill(editedGreekPrompt);
    await page.getByTestId("question-questionnaire-0-en-prompt").fill(editedEnglishPrompt);
    await page.getByTestId("question-questionnaire-0-save").click();
    await expect(page.getByText("Η ερώτηση αποθηκεύτηκε.")).toBeVisible({ timeout: 15_000 });

    // Add a new game question at the end of the game section.
    await page.getByTestId("new-question-game-el-prompt").fill(newGameGreekPrompt);
    await page.getByTestId("new-question-game-el-option-a").fill("Σωστό");
    await page.getByTestId("new-question-game-el-option-b").fill("Λάθος");
    await page.getByTestId("new-question-game-el-explanation").fill("Νέα εξήγηση.");
    await page.getByTestId("new-question-game-en-prompt").fill(newGameEnglishPrompt);
    await page.getByTestId("new-question-game-en-option-a").fill("True");
    await page.getByTestId("new-question-game-en-option-b").fill("False");
    await page.getByTestId("new-question-game-en-explanation").fill("New explanation.");
    await page.getByTestId("new-question-game-save").click();
    await expect(page.getByText("Η ερώτηση προστέθηκε.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("question-editor-item-game-1")).toContainText("Ερώτηση 2");

    // Changes persist after a reload, behind the edit action.
    await page.reload();
    await expect(page.getByTestId("question-editor")).toHaveCount(0);
    await page.getByTestId("edit-questions-button").click();
    await expect(page.getByTestId("question-questionnaire-0-el-prompt")).toHaveValue(editedGreekPrompt);
    await expect(page.getByTestId("question-questionnaire-0-en-prompt")).toHaveValue(editedEnglishPrompt);
    await expect(page.getByTestId("question-editor-item-game-1")).toContainText(newGameGreekPrompt);

    // Students see the edited questionnaire prompt on their next load.
    await page.getByTestId("create-share-link").click();
    const shareUrl = await page.getByTestId("share-url").inputValue();
    expect(shareUrl).toContain("/el/s/");

    await page.goto(shareUrl);
    await page.getByTestId("student-name").fill(`Μαθητής ${suffix}`);
    await page.getByTestId("student-start").click();
    await expect(page).toHaveURL(/\/el\/s\/.+\/lesson\//);
    await page.getByTestId("tab-quiz").click();
    await expect(page.getByTestId("quiz-question")).toHaveText(editedGreekPrompt);
  } finally {
    await prisma.lesson.deleteMany({ where: { title: `Question editing lesson ${suffix}` } }).catch(() => undefined);
    await prisma.class.deleteMany({ where: { name: `Question editing class ${suffix}` } }).catch(() => undefined);
    await prisma.$disconnect();
  }
});
