import { test, expect } from "@playwright/test";

test.describe("Settings page", () => {
  test("displays cron config table", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByText("Planification des syncs")).toBeVisible();
  });

  test("shows frequency selectors", async ({ page }) => {
    await page.goto("/settings");
    const selects = page.locator("select");
    await expect(selects.first()).toBeVisible();
  });

  test("shows connection info", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByText("Connexions")).toBeVisible();
    await expect(
      page.getByText("maison-du-savon-ca.myshopify.com")
    ).toBeVisible();
  });
});
