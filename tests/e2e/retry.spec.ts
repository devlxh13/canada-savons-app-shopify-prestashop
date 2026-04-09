import { test, expect } from "@playwright/test";

test.describe("Retry page", () => {
  test("displays retry queue heading", async ({ page }) => {
    await page.goto("/retry");
    await expect(page.getByText("File de retry")).toBeVisible();
  });

  test("filter buttons present", async ({ page }) => {
    await page.goto("/retry");
    await expect(
      page.getByRole("button", { name: "En attente" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Abandonnés" })
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Tous" })).toBeVisible();
  });
});
