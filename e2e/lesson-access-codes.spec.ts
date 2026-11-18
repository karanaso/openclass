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

test("teachers share a lesson number and students open the lesson with it", async ({ page }) => {
  test.setTimeout(300_000);
  const suffix = Date.now().toString(36);
  const dir = await mkdtemp(path.join(os.tmpdir(), "lessonlab-code-e2e-"));
  const pdfPath = path.join(dir, `${suffix}-lesson.pdf`);
  await makePdf(pdfPath, `Access code lesson ${suffix}`);

  await page.goto("/el/login");
  await page.getByLabel("Κωδικός πρόσβασης").fill("change-me");
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/el\/admin/);

  const className = `Code class ${suffix}`;
  await page.getByTestId("new-class-name").fill(className);
  await page.getByTestId("create-class").click();
  await page.locator(`[data-class-name="${className}"]`).getByRole("link", { name: "Άνοιγμα τάξης" }).click();
  await expect(page).toHaveURL(/\/el\/admin\/classes\//);

  await page.getByTestId("lesson-file-input").setInputFiles([pdfPath]);
  await expect(page.getByTestId("lesson-status")).toHaveAttribute("data-status", "READY", { timeout: 45_000 });
  await page.getByRole("link", { name: "Άνοιγμα μαθήματος" }).first().click();
  await expect(page).toHaveURL(/\/el\/admin\/lessons\//);

  const codeValue = page.getByTestId("lesson-access-code-value");
  const firstCode = (await codeValue.textContent())!.trim();
  expect(firstCode).toMatch(/^[1-9]\d{8}$/);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTestId("refresh-lesson-access-code").click();
  await expect(codeValue).not.toHaveText(firstCode);
  const newCode = (await codeValue.textContent())!.trim();
  expect(newCode).toMatch(/^[1-9]\d{8}$/);
  await expect(page.getByText("Ο νέος αριθμός μαθήματος δημιουργήθηκε.")).toBeVisible();

  await page.goto("/el");
  await page.getByTestId("access-code-input").fill(newCode);
  await page.getByTestId("access-code-submit").click();

  await expect(page).toHaveURL(new RegExp(`/el/s/${newCode}$`));
  await page.getByTestId("student-school").fill("1ο Γυμνάσιο");
  await page.getByTestId("student-name").fill(`Μαθήτρια ${suffix}`);
  await page.getByTestId("student-start").click();

  await expect(page).toHaveURL(new RegExp(`/el/s/${newCode}/lesson/`));
  await expect(page.getByTestId("tab-pdf")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("tab-cards")).toBeVisible();

  await page.goto(`/el/s/${firstCode}`);
  await expect(page.getByText("Ο αριθμός μαθήματος δεν είναι έγκυρος.")).toBeVisible();
});
