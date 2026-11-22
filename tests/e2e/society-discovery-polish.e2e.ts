import { expect, test } from "@playwright/test";

test("society search and list view survive reload and detail-page Back", async ({ page }) => {
  await page.goto("/societies");
  const first = page.locator("[data-society-id]").first();
  test.skip(await first.count() === 0, "No published communities in this dataset");
  const name = (await first.locator("h2").innerText()).trim();
  const search = page.getByRole("searchbox", { name: "Search societies", exact: true });
  await page.getByRole("button", { name: "List view" }).click();
  await search.fill(name);
  await expect(page).toHaveURL(/q=/);
  await expect(search).toBeFocused();
  await expect(page.locator("[data-society-id]")).toHaveCount(1);
  await expect(page.getByRole("status")).toContainText("Showing 1 of");
  await page.reload();
  await expect(search).toHaveValue(name);
  await expect(page.getByRole("button", { name: "List view" })).toHaveAttribute("aria-pressed", "true");
  await page.locator("[data-society-id]").click();
  await expect(page).toHaveURL(/\/societies\//);
  await page.goBack();
  await expect(search).toHaveValue(name);
  await expect(page.locator("[data-society-id]")).toHaveCount(1);
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(search).toHaveValue("");
  await expect(page).toHaveURL(/view=list/);
});

test("filtered-out network destinations are disabled", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/societies");
  const entries = page.locator("[data-society-id]");
  test.skip(await entries.count() < 2, "Need two published communities");
  const name = (await entries.first().locator("h2").innerText()).trim();
  await page.getByRole("searchbox", { name: "Search societies" }).fill(name);
  const enabled = page.locator("[data-society-node]:enabled");
  await expect(enabled).toHaveCount(1);
  await expect(page.locator("[data-society-node]:disabled").first()).toBeDisabled();
  const box = await enabled.boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await enabled.click();
  await expect(entries.first()).toBeFocused();
});

test("society content is visible before JavaScript loads and respects URL view", async ({ page, browser }) => {
  await page.goto("/societies");
  const origin = new URL(page.url()).origin;
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } });
  try {
    const baseline = await context.newPage();
    await baseline.goto(`${origin}/societies?view=list`);
    await expect(baseline.getByRole("heading", { level: 1 })).toContainText("A home for the communities");
    await expect(baseline.getByRole("button", { name: "List view" })).toHaveAttribute("aria-pressed", "true");
    const entry = baseline.locator("[data-society-id]").first();
    if (await entry.count()) {
      expect(await entry.evaluate(node => {
        for (let parent: Element | null = node; parent; parent = parent.parentElement) {
          if (Number(getComputedStyle(parent).opacity) === 0) return false;
        }
        return true;
      })).toBe(true);
    }
  } finally { await context.close(); }
});

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`society list and long queries fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/societies?view=list");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const names = page.locator("[data-society-id] h2");
    if (await names.count()) {
      const clipped = await names.evaluateAll(nodes => nodes.filter(node => getComputedStyle(node).textOverflow === "ellipsis" || node.scrollWidth > node.clientWidth + 1).map(node => ({ name: node.textContent, width: node.clientWidth, scroll: node.scrollWidth, wrap: getComputedStyle(node).overflowWrap })));
      expect(clipped).toEqual([]);
      if (width < 640) await expect(names.first()).toBeInViewport();
    }
    const search = page.getByRole("searchbox", { name: "Search societies" });
    await search.fill("not-a-community-".repeat(20));
    await expect(search).toBeFocused();
    await expect(search).toBeInViewport();
    await expect(page.getByRole("heading", { name: /No communities match|community directory is being updated/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    if (await page.getByRole("button", { name: "Clear search", exact: true }).count() > 1) {
      await page.getByRole("button", { name: "Clear search", exact: true }).last().click();
      await expect(search).toHaveValue("");
    }
  });
}
