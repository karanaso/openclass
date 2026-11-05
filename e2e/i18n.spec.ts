import { expect, test } from "@playwright/test";

test.describe("locale handling", () => {
  test("defaults to Greek and keeps the requested path and query", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/el$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Μετέτρεψε");

    await page.goto("/el/login?from=test");
    await page.locator("select").first().selectOption("en");
    await expect(page).toHaveURL(/\/en\/login\?from=test/);
    await expect(page.getByRole("heading", { name: "Teacher login" })).toBeVisible();
  });
});

test.describe("Accept-Language negotiation", () => {
  test.use({ locale: "en-US" });

  test("lands on English when the browser prefers English", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Turn every lesson");
  });
});
