import { expect, test } from "@playwright/test";

test.describe("public reduced motion", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("keeps Home identity while stopping continuous decorative motion", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);

    await expect(page.getByRole("heading", { level: 1, name: "IEEE", exact: true })).toBeVisible();
    await expect(page.locator("[data-stars-background]").first()).toBeVisible();
    await expect(page.locator("[data-home-execom-static]")).toBeAttached();
    await expect(page.locator("[data-home-execom-track]")).toHaveCount(0);

    await page.waitForTimeout(900);
    await expect(page.locator("[data-shooting-stars] rect")).toHaveCount(0);
  });
});