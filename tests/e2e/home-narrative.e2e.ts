import { expect, test } from "@playwright/test";

test.describe("Home narrative", () => {
  test("keeps the identity hero and moves directly into the four-part branch story", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.ok()).toBeTruthy();
    await expect(page.getByText("IEEE", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Now at Sahrdaya", { exact: true })).toBeVisible();
    await expect(page.getByText("The people", { exact: true })).toBeVisible();
    await expect(page.getByText("From the branch", { exact: true })).toBeVisible();
    await expect(page.getByText("Call for Papers: Int'l Conference on Robotics open now.")).toHaveCount(0);
  });

  test("the first live event links to its own detail page when programme data exists", async ({ page }) => {
    await page.goto("/");
    const lead = page.locator('section#events a[href^="/events/"]').first();
    if (await lead.count()) {
      await expect(lead).toHaveAttribute("href", /\/events\/[a-z0-9-]+/i);
    }
  });

  test("keeps the curated archive static when reduced motion is requested", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const strip = page.getByTestId("curated-event-strip");
    await expect(strip).toBeAttached();
    await expect(strip.locator("img")).toHaveCount(7);
    await expect.poll(async () => strip.evaluate((element) => getComputedStyle(element).transform)).toBe("none");
  });

  test("has no horizontal overflow on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
