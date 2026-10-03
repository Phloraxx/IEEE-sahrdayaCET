import { expect, test, type Page } from "@playwright/test";

async function articlePath(page: Page) {
  await page.goto("/blog");
  const paths = await page.locator('[data-blog-archive-row] a').evaluateAll(nodes => nodes.map(node => node.getAttribute("href")));
  const path = paths.find(path => path?.includes("reading-regression-sections-")) || paths[0];
  expect(path, "Published reading fixture is required").toMatch(/^\/blog\//);
  return path!;
}

async function checkContents(page: Page, width: number) {
  const headings = page.getByTestId("article-body").locator("h2, h3");
  const count = await headings.count();
  const disclosure = page.getByTestId("article-mobile-contents");
  if (count < 2) { await expect(disclosure).toHaveCount(0); return; }
  if (width < 1280) {
    await expect(disclosure).toBeVisible();
    await disclosure.locator("summary").press("Enter");
    await expect(disclosure).toHaveAttribute("open", "");
  } else await expect(disclosure).toBeHidden();
  const contents = page.getByRole("navigation", { name: "Article contents", exact: true }).filter({ visible: true });
  await expect(contents.getByRole("link")).toHaveCount(count);
  const link = contents.getByRole("link").last();
  expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const href = await link.getAttribute("href");
  expect(href).toMatch(/^#/);
  await link.click();
  await expect(page.locator(href!)).toBeInViewport();
  await expect(page).toHaveURL(new RegExp(href! + "$"));
}

for (const width of [320, 390, 768, 1440]) {
  test(`article reading and profile facts fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(await articlePath(page));
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    const back = page.getByTestId("blog-article-header").getByRole("link", { name: "Blog / Archive" });
    expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await checkContents(page, width);
    const footer = page.getByRole("navigation", { name: "Article navigation", exact: true });
    await footer.getByRole("link", { name: "Back to top" }).click();
    await expect(page.getByTestId("blog-article-header")).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    // Stress only this browser DOM; no stored content is edited.
    await page.getByRole("heading", { level: 1 }).evaluate(node => { node.textContent = "LongTitle".repeat(40); });
    expect(await page.getByRole("heading", { level: 1 }).evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    await page.goto("/societies");
    const path = await page.locator('a[href^="/societies/"]:not([href="/societies/wie"])').first().getAttribute("href");
    expect(path).toBeTruthy();
    await page.goto(path!);
    const facts = page.getByTestId("society-profile-facts");
    await expect(facts.locator("dt")).toHaveCount(4);
    if (width < 640) {
      const boxes = await facts.locator("dd").evaluateAll(nodes => nodes.map(node => ({x:node.getBoundingClientRect().x,y:node.getBoundingClientRect().y})));
      const [first, second, third] = boxes;
      if (!first || !second || !third) throw new Error("Four profile facts are required");
      expect(first.y).toBe(second.y);
      expect(third.y).toBeGreaterThan(first.y);
      expect(second.x).toBeGreaterThan(first.x);
    }
    const about = page.getByTestId("society-profile-hero").locator('a[href="#about"]');
    expect((await about.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await about.click();
    await expect(page.locator("#about")).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.getByRole("heading", { level: 1 }).evaluate(node => { node.textContent = "LongSociety".repeat(40); });
    expect(await page.getByRole("heading", { level: 1 }).evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  });
}

test("article contents and return navigation work without JavaScript", async ({ page, browser, baseURL }) => {
  const path = await articlePath(page);
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: {width:390,height:844} });
  try {
    const baseline = await context.newPage();
    await baseline.goto(`${baseURL}${path}`);
    await checkContents(baseline, 390);
    await baseline.getByRole("navigation", {name:"Article navigation",exact:true}).getByRole("link", {name:"Back to top"}).click();
    await expect(baseline.getByTestId("blog-article-header")).toBeInViewport();
  } finally { await context.close(); }
});

test("short articles omit empty contents and retain return navigation", async ({ page }) => {
  await page.goto("/blog");
  const short = page.locator('[data-blog-archive-row] a[href*="/blog/reading-regression-short-"]');
  test.skip(!(await short.count()), "Short article fixture belongs to disposable CI only");
  await page.goto((await short.first().getAttribute("href"))!);
  await expect(page.getByTestId("article-mobile-contents")).toHaveCount(0);
  await expect(page.getByRole("navigation", {name:"Article contents",exact:true})).toHaveCount(0);
  await expect(page.getByRole("navigation", {name:"Article navigation",exact:true}).getByRole("link", {name:"Open archive"})).toBeVisible();
});
