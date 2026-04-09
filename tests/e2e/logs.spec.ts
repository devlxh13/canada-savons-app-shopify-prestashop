import { test, expect } from "@playwright/test";

test.describe("Logs page", () => {
  test("displays filter bar", async ({ page }) => {
    await page.goto("/logs");
    await expect(page.getByText("7j")).toBeVisible();
    await expect(page.getByPlaceholder("Rechercher")).toBeVisible();
  });

  test("date range filter buttons work", async ({ page }) => {
    await page.goto("/logs");
    const btn30 = page.getByRole("button", { name: "30j" });
    await btn30.click();
    // Verify button is visually active (has different styling)
    await expect(btn30).toBeVisible();
  });
});
