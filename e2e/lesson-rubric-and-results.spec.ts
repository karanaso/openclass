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

test("teacher edits a rubric, students see it after Quiz, and the lesson dashboard shows results", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const suffix = Date.now().toString(36);
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl() } } });
  const updatedCriterion = `Νέο κριτήριο ${suffix}`;

  try {
    const classroom = await prisma.class.create({ data: { name: `Rubric class ${suffix}` } });
    const lesson = await prisma.lesson.create({
      data: {
        classId: classroom.id,
        accessCode: String(100000000 + Math.floor(Math.random() * 900000000)),
        title: `Rubric lesson ${suffix}`,
        originalFilename: `rubric-${suffix}.pdf`,
        storageKey: `lessons/rubric-${suffix}/original.pdf`,
        checksum: `rubric-checksum-${suffix}`,
        sizeBytes: 100,
        pageCount: 2,
        sourceLocale: "el",
        status: "READY",
        readyAt: new Date(),
        rubric: {
          criteria: [1, 2, 3].map((index) => ({
            id: `criterion-${index}`,
            title: { el: `Κριτήριο ${index}`, en: `Criterion ${index}` },
            description: { el: `Περιγραφή ${index}`, en: `Description ${index}` },
          })),
          levels: [1, 2, 3].map((index) => ({
            id: `level-${index}`,
            label: { el: `Επίπεδο ${index}`, en: `Level ${index}` },
            description: { el: `Περιγραφή επιπέδου ${index}`, en: `Level description ${index}` },
          })),
        },
      },
    });
    await prisma.question.create({
      data: {
        lessonId: lesson.id,
        mode: "QUESTIONNAIRE",
        itemKey: "q-1",
        position: 1,
        type: "MULTIPLE_CHOICE",
        correctOptionId: "a",
        sourcePage: 1,
        translations: {
          create: [
            {
              locale: "el",
              prompt: "Ποια είναι η σωστή απάντηση;",
              options: ["a", "b", "c", "d"].map((id) => ({ id, text: `Επιλογή ${id}` })),
              explanation: "Εξήγηση",
            },
            {
              locale: "en",
              prompt: "Which is the correct answer?",
              options: ["a", "b", "c", "d"].map((id) => ({ id, text: `Option ${id}` })),
              explanation: "Explanation",
            },
          ],
        },
      },
    });
    await prisma.attempt.create({
      data: {
        lessonId: lesson.id,
        studentName: "Μαθήτρια",
        normalizedStudentName: "μαθητρια",
        studentSchool: "1ο Γυμνάσιο",
        mode: "QUESTIONNAIRE",
        locale: "el",
        score: 9,
        maxScore: 10,
        percentage: 90,
        passed: true,
        durationMs: 60_000,
        completedAt: new Date(),
      },
    });

    await page.goto("/el/login");
    await page.getByLabel("Κωδικός πρόσβασης").fill("change-me");
    await page.getByTestId("login-submit").click();
    await expect(page).toHaveURL(/\/el\/admin/);

    await page.goto(`/el/admin/lessons/${lesson.id}`);
    await expect(page.getByTestId("lesson-rubric-editor")).toBeVisible();
    await page.getByTestId("rubric-criterion-title-el-0").fill(updatedCriterion);
    await page.getByTestId("rubric-save").click();
    await expect(page.getByText("Η ρουμπρίκα αποθηκεύτηκε.")).toBeVisible({ timeout: 15_000 });

    const stored = await prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(stored.rubricEdited).toBe(true);
    expect(stored.rubric).toMatchObject({
      criteria: expect.arrayContaining([
        expect.objectContaining({ title: expect.objectContaining({ el: updatedCriterion }) }),
      ]),
    });

    await page.getByTestId("create-share-link").click();
    const shareUrl = await page.getByTestId("share-url").inputValue();
    await page.goto(shareUrl);
    await page.getByTestId("student-school").fill("1ο Γυμνάσιο");
    await page.getByTestId("student-name").fill(`Μαθήτρια ${suffix}`);
    await page.getByTestId("student-start").click();
    await expect(page).toHaveURL(/\/el\/s\/.+\/lesson\//);

    const tabs = page.getByRole("tab");
    await expect(tabs).toHaveCount(2);
    await expect(tabs.nth(0)).toHaveAttribute("data-testid", "tab-quiz");
    await expect(tabs.nth(1)).toHaveAttribute("data-testid", "tab-rubric");

    await page.getByTestId("tab-rubric").click();
    await expect(page.getByTestId("lesson-rubric")).toBeVisible();
    await expect(page.getByText(updatedCriterion)).toBeVisible();
    await expect(page.getByText("Η ρουμπρίκα εξηγεί τι αξιολογείται")).toBeVisible();

    await page.goto(`/el/admin/lessons/${lesson.id}/results`);
    await expect(page.getByText("Μοναδικοί μαθητές")).toBeVisible();
    await expect(page.getByText("Κατανομή βαθμολογιών")).toBeVisible();
    await expect(page.getByText("Επίδοση ανά μαθητή")).toBeVisible();
    await expect(page.getByRole("cell", { name: "Μαθήτρια", exact: true }).first()).toBeVisible();
    await expect(page.getByText("81-100%")).toBeVisible();
  } finally {
    await prisma.$disconnect();
  }
});
