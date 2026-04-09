import { test, expect } from "@playwright/test";

test.describe("Overview page", () => {
  test("displays KPI cards", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Total synchronisé")).toBeVisible();
    await expect(page.getByText("Produits")).toBeVisible();
    await expect(page.getByText("Clients")).toBeVisible();
    await expect(page.getByText("Commandes")).toBeVisible();
    await expect(page.getByText("Erreurs (24h)")).toBeVisible();
  });

  test("displays sync chart", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Activité de synchronisation")).toBeVisible();
  });

  test("displays scheduled syncs", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Syncs programmés")).toBeVisible();
  });

  test("displays recent activity", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Activité récente")).toBeVisible();
  });
});
