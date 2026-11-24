import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

const STORAGE_KEY = "lessonlab-theme";

async function login(page: Page) {
  await page.goto("/el/login");
  await page.getByLabel("Κωδικός πρόσβασης").fill("change-me");
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/el\/admin/);
}

async function makePdf() {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const page = document.addPage([600, 400]);
  page.drawText("Theme test lesson", { x: 40, y: 340, size: 18, font });
  page.drawText("Photosynthesis converts light into chemical energy.", { x: 40, y: 300, size: 13, font });
  page.drawText("Plants use chlorophyll to absorb light.", { x: 40, y: 270, size: 13, font });
  return new Uint8Array(await document.save());
}

async function createReadyLesson(page: Page, suffix: string) {
  const createClass = await page.request.post("/api/admin/classes", {
    data: { name: `Theme class ${suffix}` },
  });
  expect(createClass.status()).toBe(201);
  const { class: classroom } = await createClass.json();

  const upload = await page.request.post(`/api/admin/classes/${classroom.id}/lessons`, {
    multipart: {
      files: {
        name: "theme.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from(await makePdf()),
      },
    },
  });
  expect(upload.status()).toBe(201);

  let lessonId: string | undefined;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const response = await page.request.get(`/api/admin/classes/${classroom.id}/lessons`);
    const body = await response.json();
    const lesson = body.lessons?.[0];
    if (lesson?.status === "READY") {
      lessonId = lesson.id;
      break;
    }
    await page.waitForTimeout(1000);
  }
  expect(lessonId).toBeTruthy();

  const linkResponse = await page.request.post("/api/admin/share-links", {
    data: { lessonId: lessonId! },
  });
  expect(linkResponse.status()).toBe(201);
  const { token } = await linkResponse.json();

  return { classroomId: classroom.id as string, token: token as string };
}

async function noHorizontalOverflow(page: Page) {
  const result = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(result.scrollWidth, JSON.stringify(result)).toBeLessThanOrEqual(result.viewport + 1);
}

test.describe("appearance theme", () => {
  test("system dark is the first-paint default and explicit choices persist", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/el", { waitUntil: "domcontentloaded" });

    const html = page.locator("html");
    await expect(html).toHaveClass(/dark/);
    await expect(page.getByTestId("theme-switcher")).toHaveValue("system");
    const firstPaint = await page.evaluate(() => ({
      dark: document.documentElement.classList.contains("dark"),
      scheme: getComputedStyle(document.documentElement).colorScheme,
      preference: document.documentElement.dataset.themePreference,
    }));
    expect(firstPaint.dark).toBe(true);
    expect(firstPaint.scheme).toContain("dark");
    expect(firstPaint.preference).toBe("system");

    await page.getByTestId("theme-switcher").selectOption("light");
    await expect(html).not.toHaveClass(/dark/);
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe("light");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(html).not.toHaveClass(/dark/);
    await expect(page.getByTestId("theme-switcher")).toHaveValue("light");

    await page.getByTestId("theme-switcher").selectOption("dark");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(html).toHaveClass(/dark/);
    await expect(page.getByTestId("theme-switcher")).toHaveValue("dark");

    await page.getByRole("combobox", { name: "Γλώσσα" }).selectOption("en");
    await expect(page).toHaveURL(/\/en/);
    await expect(page.getByTestId("theme-switcher")).toHaveValue("dark");
    await expect(html).toHaveClass(/dark/);
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe("dark");
  });

  test("defaults to light when the system is light and keeps the header inside the viewport", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/el", { waitUntil: "domcontentloaded" });

    const html = page.locator("html");
    await expect(html).not.toHaveClass(/dark/);
    await expect(page.getByTestId("theme-switcher")).toHaveValue("system");
    await expect(page.getByTestId("theme-switcher")).toBeVisible();
    await noHorizontalOverflow(page);
  });

  test("student lesson header choice persists into the lesson tabs", async ({ page }) => {
    test.setTimeout(180_000);
    const suffix = Date.now().toString(36);
    await login(page);
    const { classroomId, token } = await createReadyLesson(page, suffix);

    try {
      await page.goto(`/el/s/${token}`);
      await expect(page.getByTestId("theme-switcher")).toBeVisible();
      await page.getByTestId("theme-switcher").selectOption("dark");
      await expect(page.locator("html")).toHaveClass(/dark/);

      await page.getByTestId("student-school").fill("1ο Γυμνάσιο");
      await page.getByTestId("student-name").fill(`Theme Student ${suffix}`);
      await page.getByTestId("student-start").click();
      await expect(page).toHaveURL(/\/el\/s\/.+\/lesson\//, { timeout: 20_000 });

      await expect(page.getByTestId("theme-switcher")).toHaveValue("dark");
      await expect(page.locator("html")).toHaveClass(/dark/);
      await page.getByTestId("tab-cards").click();
      await expect(page.getByTestId("tab-cards")).toHaveAttribute("aria-selected", "true");
      await expect(page.getByTestId("card-deck")).toBeVisible();

      const colors = await page.evaluate(() => ({
        body: getComputedStyle(document.body).backgroundColor,
        card: getComputedStyle(document.querySelector("[data-testid='card-deck'] > div") as HTMLElement)
          .backgroundColor,
      }));
      expect(colors.body).not.toBe("rgb(248, 250, 252)");

      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByTestId("theme-switcher").selectOption("light");
      await expect(page.locator("html")).not.toHaveClass(/dark/);
      await noHorizontalOverflow(page);
    } finally {
      await page.request.delete(`/api/admin/classes/${classroomId}`, { data: { confirm: true } });
    }
  });
});
