import { expect, test } from "@playwright/test";

test("desktop navigation is visible before JavaScript loads", async ({ page, browser }) => {
  await page.goto("/events");
  const origin = new URL(page.url()).origin;
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
  try {
    const baseline = await context.newPage();
    await baseline.goto(`${origin}/events`);
    const nav = baseline.getByRole("navigation", { name: "Primary navigation", exact: true });
    await expect(nav.getByRole("link", { name: "HOME", exact: true })).toBeVisible();
    expect(await nav.evaluate(element => {
      for (let current: Element | null = element; current; current = current.parentElement) {
        if (Number(getComputedStyle(current).opacity) === 0) return false;
      }
      return true;
    })).toBe(true);
  } finally { await context.close(); }
});

test("blog search and view persist through reload with a useful zero-result state", async ({ page }) => {
  await page.goto("/blog?q=not-a-real-story&view=index");
  const search = page.getByRole("searchbox", { name: "Search blog stories" });
  await expect(search).toHaveValue("not-a-real-story");
  await expect(page.getByRole("button", { name: "Index", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("blog-lead-story")).toHaveCount(0);
  await page.reload();
  await expect(search).toHaveValue("not-a-real-story");
  await expect(page.getByRole("heading", { name: /No stories match your filters|Stories coming soon/ })).toBeVisible();
  await page.getByRole("button", { name: "Reset filters", exact: true }).click();
  await expect(search).toHaveValue("");
  await expect(page).toHaveURL(/view=index/);
});

test("a featured blog story is searchable", async ({ page }) => {
  await page.goto("/blog");
  const lead = page.getByTestId("blog-lead-story");
  test.skip(await lead.count() === 0, "No published blog stories in this database");
  const title = await lead.locator("h2").innerText();
  const href = await lead.locator('a[href^="/blog/"]').first().getAttribute("href");
  await page.getByRole("searchbox", { name: "Search blog stories" }).fill(title);
  await expect(page.getByTestId("blog-lead-story")).toHaveCount(0);
  await expect(page.locator(`[data-blog-archive-row] a[href="${href}"]`)).toBeVisible();
});

test("directory filters survive reload and member profiles isolate the background", async ({ page }) => {
  await page.goto("/full-execom?view=roster");
  test.skip(await page.locator("[data-execom-roster-row]").count() === 0, "No published members in this database");
  const search = page.getByRole("searchbox", { name: "Search Execom" });
  await search.fill("zzzz-not-a-member");
  await page.reload();
  await expect(search).toHaveValue("zzzz-not-a-member");
  await expect(page.getByRole("button", { name: "Roster", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Reset directory" }).click();
  const opener = page.locator("[data-execom-roster-row]").first();
  await opener.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary navigation", exact: true })).toHaveCount(0);
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
});

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`discovery views fit ${width}px and expose usable group filters`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/events", "/blog?view=index", "/full-execom?view=roster"]) {
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), path).toBeLessThanOrEqual(1);
    }
    const groups = page.getByRole("combobox", { name: "Filter Execom by group" });
    if (width < 640 && await groups.count()) {
      await expect(groups).toBeVisible();
      const option = groups.locator('option:not([value="all"])').first();
      if (await option.count()) {
        const value = await option.getAttribute("value");
        await groups.selectOption(value!);
        expect(new URL(page.url()).searchParams.get("group")).toBe(value);
        await page.reload();
        await expect(groups).toHaveValue(value!);
      }
    }
  });
}
