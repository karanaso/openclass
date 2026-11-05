import { expect, test } from "@playwright/test";

test("teacher can create, rename, reorder, and delete classes", async ({ page }) => {
  const suffix = Date.now().toString(36);
  const nameA = `Class A ${suffix}`;
  const nameB = `Class B ${suffix}`;

  await page.goto("/el/login");
  await page.getByLabel("Κωδικός πρόσβασης").fill("change-me");
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/el\/admin/);

  const classesResponse = await page.request.get("/api/admin/classes");
  const classesBody = (await classesResponse.json()) as { classes: Array<{ id: string; name: string }> };
  const demoClass = classesBody.classes.find((item) => item.name === "Demo Class");
  expect(demoClass).toBeTruthy();
  const demoLessonsResponse = await page.request.get(`/api/admin/classes/${demoClass!.id}/lessons`);
  const demoLessons = (await demoLessonsResponse.json()) as { lessons: Array<{ id: string; title: string }> };
  const demoLesson = demoLessons.lessons.find((item) => item.title === "Demo Lesson");
  expect(demoLesson).toBeTruthy();
  await page.goto(`/el/admin/lessons/${demoLesson!.id}`);
  await expect(page.getByRole("heading", { name: "Demo Lesson" })).toBeVisible();
  await expect(page.getByText("Παραγόμενο περιεχόμενο")).toBeVisible();
  await page.goto("/el/admin");

  await page.getByTestId("new-class-name").fill(nameA);
  await page.getByTestId("create-class").click();
  await expect(page.locator(`[data-class-name="${nameA}"]`)).toBeVisible();

  await page.locator(`[data-class-name="${nameA}"]`).getByRole("link", { name: "Άνοιγμα τάξης" }).click();
  await expect(page.getByRole("heading", { name: nameA })).toBeVisible();
  await expect(page.getByText("Δεν υπάρχουν μαθήματα σε αυτή την τάξη.")).toBeVisible();
  await page.getByRole("link", { name: "Πίσω στις τάξεις" }).click();
  await expect(page).toHaveURL(/\/el\/admin$/);

  await page.getByTestId("new-class-name").fill(nameB);
  await page.getByTestId("create-class").click();
  await expect(page.locator(`[data-class-name="${nameB}"]`)).toBeVisible();

  const cardA = page.locator(`[data-class-name="${nameA}"]`);
  const idA = await cardA.getAttribute("data-class-id");
  expect(idA).toBeTruthy();

  await page.getByTestId(`edit-class-${idA}`).click();
  const renamed = `${nameA} renamed`;
  await cardA.getByLabel("Όνομα τάξης").fill(renamed);
  await cardA.getByRole("button", { name: "Αποθήκευση" }).click();
  await expect(page.locator(`[data-class-name="${renamed}"]`)).toBeVisible();

  await page.reload();
  await expect(page.locator(`[data-class-name="${renamed}"]`)).toBeVisible();

  const renamedCard = page.locator(`[data-class-name="${renamed}"]`);
  const cardB = page.locator(`[data-class-name="${nameB}"]`);
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await cardB.dispatchEvent("dragstart", { dataTransfer });
  await page.waitForTimeout(100);
  await renamedCard.dispatchEvent("dragover", { dataTransfer });
  await renamedCard.dispatchEvent("drop", { dataTransfer });
  await cardB.dispatchEvent("dragend", { dataTransfer });

  await expect
    .poll(async () => {
      const names = await page
        .locator("[data-testid=class-list] [data-class-id]")
        .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-class-name")));
      const bIndex = names.indexOf(nameB);
      const aIndex = names.indexOf(renamed);
      return bIndex >= 0 && aIndex >= 0 && bIndex < aIndex;
    })
    .toBe(true);
  const orderAfterDrop = await page
    .locator("[data-testid=class-list] [data-class-id]")
    .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-class-name")));
  expect(orderAfterDrop.indexOf(nameB)).toBeLessThan(orderAfterDrop.indexOf(renamed));

  await page.reload();
  const orderAfterReload = await page
    .locator("[data-testid=class-list] [data-class-id]")
    .evaluateAll((elements) => elements.map((element) => element.getAttribute("data-class-name")));
  expect(orderAfterReload.indexOf(nameB)).toBeLessThan(orderAfterReload.indexOf(renamed));

  page.on("dialog", (dialog) => dialog.accept());
  const idB = await cardB.getAttribute("data-class-id");
  await page.getByTestId(`delete-class-${idB}`).click();
  await expect(page.locator(`[data-class-name="${nameB}"]`)).toHaveCount(0);

  const idRenamed = await renamedCard.getAttribute("data-class-id");
  await page.getByTestId(`delete-class-${idRenamed}`).click();
  await expect(page.locator(`[data-class-name="${renamed}"]`)).toHaveCount(0);
});
