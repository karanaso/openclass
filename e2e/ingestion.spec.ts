import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

async function makePdf(filePath: string, title: string) {
  const document = await PDFDocument.create();
  const page = document.addPage([600, 400]);
  const font = await document.embedFont(StandardFonts.Helvetica);
  page.drawText(title, { x: 40, y: 340, size: 18, font });
  page.drawText("Photosynthesis converts light energy into chemical energy.", {
    x: 40,
    y: 300,
    size: 14,
    font,
    maxWidth: 520,
  });
  await writeFile(filePath, await document.save());
}

test("teacher can upload PDFs, see live status, and handle duplicates", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const dir = await mkdtemp(path.join(os.tmpdir(), "lessonlab-e2e-"));
  const pdfPath = path.join(dir, `${suffix}-photosynthesis.pdf`);
  const textPath = path.join(dir, `${suffix}-notes.txt`);
  await makePdf(pdfPath, `Lesson ${suffix}`);
  await writeFile(textPath, "not a pdf");

  await page.goto("/el/login");
  await page.getByLabel("Κωδικός πρόσβασης").fill("change-me");
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/el\/admin/);

  const className = `Upload class ${suffix}`;
  await page.getByTestId("new-class-name").fill(className);
  await page.getByTestId("create-class").click();
  await page.locator(`[data-class-name="${className}"]`).getByRole("link", { name: "Άνοιγμα τάξης" }).click();
  await expect(page).toHaveURL(/\/el\/admin\/classes\//);
  const classId = page.url().split("/").pop()!;

  await page.getByTestId("lesson-file-input").setInputFiles([pdfPath, textPath]);
  await expect(page.getByTestId("upload-results")).toContainText(`${suffix}-photosynthesis.pdf`);
  await expect(page.getByTestId("upload-results")).toContainText("Έγιναν δεκτά");
  await expect(page.getByTestId("upload-results")).toContainText("Απορρίφθηκαν");
  await expect(page.getByTestId("upload-results")).toContainText("Only PDF files are accepted");

  await expect(page.getByTestId("lesson-status")).toHaveAttribute("data-status", "READY", { timeout: 25_000 });

  await page.getByRole("button", { name: "Επαναδημιουργία" }).first().click();
  await expect(page.getByTestId("lesson-status")).toHaveAttribute("data-status", "READY", { timeout: 25_000 });

  await page.getByTestId("lesson-file-input").setInputFiles([pdfPath]);
  await expect(page.getByTestId("upload-results")).toContainText("Πιθανά διπλότυπα");
  await page.getByRole("button", { name: "Διατήρηση ούτως ή άλλως" }).click();
  await expect(page.getByTestId("upload-results").locator("text=Έγιναν δεκτά")).toHaveCount(2, { timeout: 10_000 });

  await page.request.delete(`/api/admin/classes/${classId}`, { data: { confirm: true } });
});
