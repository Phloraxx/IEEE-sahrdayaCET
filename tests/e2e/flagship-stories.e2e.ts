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

  test("keeps four editions separate and crawlable without JavaScript", async ({ browser, request }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL: test.info().project.use.baseURL, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const editions = [
      { title: "Altair", path: "/altair/2022", year: "2022", date: "11–13 November 2022" },
      { title: "Altair 2.0", path: "/altair/2023", year: "2023", date: "2023 programme" },
      { title: "TechX Infinia", path: "/infinia/2024", year: "2024", date: "27–29 September 2024" },
      { title: "Infinia 2.0", path: "/infinia/2025", year: "2025", date: "26–28 September 2025" },
    ].reverse();
    try {
      await page.goto("/flagships");
      await expect(page.locator('section[aria-label="Flagship edition timeline"] h2')).toHaveText(editions.map(item => item.title));
      for (const edition of editions) {
        await page.goto("/flagships");
        await page.getByRole("link", { name: `Explore ${edition.title}`, exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`/flagships${edition.path}$`));
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(edition.title);
        await expect(page.getByText(edition.date, { exact: true })).toBeVisible();
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://ieeesahrdaya.com/flagships${edition.path}`);
        await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", `https://ieeesahrdaya.com/flagships${edition.path}`);
        if (edition.year === "2023") {
          await expect(page.getByText("Programme archive", { exact: false }).first()).toBeVisible();
          await expect(page.locator('main img[src$="altair-2023-teamwork.webp"]')).toBeVisible();
          await expect(page.getByText(/announced in the Altair 2.0 brochure/)).toBeVisible();
        }
        const images = await page.locator("main img").evaluateAll(elements => elements.map(element => element.getAttribute("src")));
        expect(images.length).toBeGreaterThanOrEqual(2);
        for (const src of images) expect(src).toContain(`-${edition.year}-`);
        await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", new RegExp(`-${edition.year}-.*\\.webp$`));
        await page.getByRole("link", { name: "Flagship timeline", exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`/flagships#year-${edition.year}$`));
        await page.reload();
        await expect(page.locator(`#title-${edition.year}`)).toBeInViewport();
      }
      expect((await request.get("/flagships/altair/2025")).status()).toBe(404);
      expect((await request.get("/flagships/infinia/2099")).status()).toBe(404);
    } finally { await context.close(); }
  });

  test("timeline year links keep the selected chapter clear of the desktop navbar", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/flagships");
    await page.getByRole("navigation", { name: "Timeline years" }).getByRole("link", { name: "2025", exact: true }).click();
    await expect(page).toHaveURL(/#year-2025$/);
    const top = await page.locator("#title-2025").evaluate(element => element.getBoundingClientRect().top);
    expect(top).toBeGreaterThanOrEqual(95);
    expect(top).toBeLessThan(400);
    await page.getByRole("link", { name: "Explore Infinia 2.0", exact: true }).click();
    await page.getByRole("navigation", { name: "Other editions" }).getByRole("link", { name: "TechX Infinia · 2024" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("TechX Infinia");
  });

  for (const width of [320, 390, 768, 1440]) {
    test(`keeps story pages readable at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      for (const slug of ["", "/infinia", "/altair", "/altair/2022", "/altair/2023", "/infinia/2024", "/infinia/2025"]) {
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
