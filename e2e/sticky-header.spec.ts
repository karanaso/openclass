import { expect, test, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

async function expectStickyHeader(page: Page) {
  const header = page.locator("header").first();
  await expect(header).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForFunction(() => window.scrollY === 0);

  const initial = await page.evaluate(() => {
    const element = document.querySelector("header");
    const main = document.querySelector("main");
    if (!element) return null;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      position: style.position,
      zIndex: Number(style.zIndex),
      width: rect.width,
      headerBottom: rect.bottom,
      mainTop: main?.getBoundingClientRect().top ?? null,
      viewportWidth: window.innerWidth,
    };
  });

  expect(initial).not.toBeNull();
  expect(initial!.position).toBe("sticky");
  expect(initial!.zIndex).toBeGreaterThanOrEqual(40);
  expect(Math.abs(initial!.width - initial!.viewportWidth)).toBeLessThanOrEqual(1);
  if (initial!.mainTop !== null) {
    expect(initial!.mainTop).toBeGreaterThanOrEqual(initial!.headerBottom - 1);
  }

  await page.evaluate(() => {
    const element = document.querySelector("header");
    const parent = element?.parentElement;
    if (parent) parent.style.minHeight = "3000px";
    if (!document.getElementById("sticky-test-spacer")) {
      const spacer = document.createElement("div");
      spacer.id = "sticky-test-spacer";
      spacer.style.height = "2000px";
      (parent ?? document.body).appendChild(spacer);
    }
    window.scrollTo(0, 900);
  });
  await page.waitForFunction(() => window.scrollY > 0);

  const afterScroll = await header.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, visible: rect.bottom > 0 };
  });
  expect(afterScroll.visible).toBe(true);
  expect(Math.abs(afterScroll.top)).toBeLessThanOrEqual(1);
}

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
  page.drawText("Sticky header test lesson", { x: 40, y: 340, size: 18, font });
  page.drawText("Photosynthesis converts light into chemical energy.", { x: 40, y: 300, size: 13, font });
  return new Uint8Array(await document.save());
}

test.describe("sticky top navigation", () => {
  test("public pages, both locales", async ({ page }) => {
    await page.goto("/el");
    await expectStickyHeader(page);

    await page.goto("/en");
    await expectStickyHeader(page);

    await page.keyboard.press("Tab");
    const focusInHeader = await page.evaluate(() => Boolean(document.activeElement?.closest("header")));
    expect(focusInHeader).toBe(true);
  });

  test("admin pages", async ({ page }) => {
    await login(page);
    await expectStickyHeader(page);
  });

  test("student share landing and lesson pages", async ({ page }) => {
    test.setTimeout(120_000);
    const suffix = Date.now().toString(36);
    await login(page);

    const classes = await page.request.get("/api/admin/classes");
    expect(classes.status()).toBe(200);

    const createClass = await page.request.post("/api/admin/classes", {
      data: { name: `Sticky class ${suffix}` },
    });
    expect(createClass.status()).toBe(201);
    const { class: classroom } = await createClass.json();

    const pdfBytes = await makePdf();
    const upload = await page.request.post(`/api/admin/classes/${classroom.id}/lessons`, {
      multipart: {
        files: {
          name: "sticky.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from(pdfBytes),
        },
      },
    });
    expect(upload.status()).toBe(201);

    let lessonId: string | undefined;
    for (let attempt = 0; attempt < 60; attempt += 1) {
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

    await page.goto(`/el/s/${token}`);
    await expectStickyHeader(page);

    await page.getByTestId("student-name").fill(`Sticky Student ${suffix}`);
    await page.getByTestId("student-start").click();
    await expect(page).toHaveURL(/\/el\/s\/.+\/lesson\//, { timeout: 20_000 });
    await expectStickyHeader(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await expectStickyHeader(page);
    const overflow = await page.evaluate(() => {
      const viewport = window.innerWidth;
      const offenders = [...document.querySelectorAll("*")]
        .map((element) => ({ element, rect: element.getBoundingClientRect() }))
        .filter(({ rect }) => rect.right > viewport + 1 || rect.left < -1)
        .map(({ element, rect }) => ({
          tag: element.tagName,
          className: typeof element.className === "string" ? element.className.slice(0, 120) : "",
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        }))
        .slice(0, 12);
      return {
        ok: document.documentElement.scrollWidth <= viewport + 1,
        scrollWidth: document.documentElement.scrollWidth,
        viewport,
        offenders,
      };
    });
    expect(overflow.ok, JSON.stringify(overflow)).toBe(true);

    await page.request.delete(`/api/admin/classes/${classroom.id}`, { data: { confirm: true } });
  });
});
