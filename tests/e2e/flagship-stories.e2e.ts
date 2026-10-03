import { expect, test } from "@playwright/test";

test.describe("flagship story archive", () => {
  test("serves complete story content and metadata without JavaScript", async ({ browser, request }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL: test.info().project.use.baseURL });
    const page = await context.newPage();
    try {
      await page.goto("/flagships");
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Shared stories");
      await page.getByRole("link", { name: "Discover Infinia", exact: true }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Infinia", exact: true })).toBeVisible();
      await expect(page.getByText("26–28 September 2025", { exact: true })).toBeVisible();
      await expect(page.getByText("27–29 September 2024", { exact: true })).toBeVisible();
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://ieeesahrdaya.com/flagships/infinia");
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /infinia-2025-community.webp$/);
      await page.getByRole("link", { name: "Altair", exact: true }).click();
      await expect(page.getByRole("heading", { level: 1, name: "Altair", exact: true })).toBeVisible();
      await expect(page.getByText("11–13 November 2022", { exact: true })).toBeVisible();
      await expect(page.getByText("2023 programme", { exact: true })).toBeVisible();
      const missing = await request.get("/flagships/unknown");
      expect(missing.status()).toBe(404);
    } finally { await context.close(); }
  });

  for (const width of [320, 390, 768, 1440]) {
    test(`keeps story pages readable at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      for (const slug of ["", "/infinia", "/altair"]) {
        await page.goto(`/flagships${slug}`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
        for (const image of await page.locator("main img").all()) {
          await image.scrollIntoViewIfNeeded();
          await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0)).toBe(true);
        }
        const linkHeights = await page.locator("main a").evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height));
        expect(linkHeights.every(height => height >= 44)).toBe(true);
      }
    });
  }

  test("links the mobile More menu to the hub and marks nested stories active", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/flagships/infinia");
    await page.getByRole("button", { name: "Open more navigation" }).click();
    const sheet = page.getByRole("dialog", { name: "Site navigation" });
    await sheet.getByRole("link", { name: /FLAGSHIPS/ }).click();
    await expect(page).toHaveURL(/\/flagships$/);
    await expect(sheet).toHaveCount(0);
    await page.getByRole("link", { name: "Discover Altair", exact: true }).click();
    await page.getByRole("button", { name: "Open more navigation" }).click();
    await expect(sheet.getByRole("link", { name: /FLAGSHIPS/ })).toHaveAttribute("aria-current", "page");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Open more navigation" })).toBeFocused();
  });

  test("edition anchors work and the verified recap stays reachable", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/flagships/infinia");
    await expect(page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "FLAGSHIPS", exact: true })).toHaveAttribute("aria-current", "page");
    await page.getByRole("navigation", { name: "Edition navigation" }).getByRole("link", { name: "TechX Infinia · 2024" }).click();
    await expect(page).toHaveURL(/#edition-2024$/);
    const headingTop = await page.locator("#heading-2024").evaluate(element => element.getBoundingClientRect().top);
    expect(headingTop).toBeGreaterThanOrEqual(95);
    expect(headingTop).toBeLessThan(400);
    await expect(page.getByRole("link", { name: "Read the 2024 event recap", exact: true })).toHaveAttribute("href", "/blog/event-recap-techx-infinia-2024-where-imagination-meets-technology");
  });
});
