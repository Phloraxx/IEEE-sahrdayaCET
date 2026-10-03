import { expect, test } from "@playwright/test";

for (const width of [320, 390]) {
  test(`mobile help is reachable and routes close the sheet at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 480 : 844 });
    await page.goto("/contact");
    const more = page.getByRole("button", { name: "Open more navigation" });
    await expect(more).toHaveAttribute("aria-current", "page");
    await more.click();
    const dialog = page.getByRole("dialog", { name: "Site navigation" });
    const help = dialog.getByRole("navigation", { name: "Mobile help navigation" });
    await expect(help.getByRole("link", { name: "Contact & support" })).toHaveAttribute("aria-current", "page");
    for (const label of ["Contact & support", "Verify a certificate", "Event pricing", "About the branch"]) {
      const link = help.getByRole("link", { name: label, exact: true });
      await link.scrollIntoViewIfNeeded();
      await expect(link).toBeInViewport();
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    // The sticky close control stays reachable after scrolling to secondary links.
    await expect(dialog.getByRole("button", { name: "Close menu" })).toBeInViewport();
    await help.getByRole("link", { name: "Event pricing", exact: true }).click();
    await expect(page).toHaveURL(/\/pricing$/);
    await expect(dialog).toHaveCount(0);
    await expect(more).toHaveAttribute("aria-current", "page");
    await more.click();
    await page.keyboard.press("Escape");
    await expect(more).toBeFocused();
  });
}

test("contact shortcuts explain account access and lead to public certificate help", async ({ page }) => {
  await page.goto("/contact");
  const shortcuts = page.getByRole("navigation", { name: "Support shortcuts" });
  await expect(shortcuts.getByRole("link", { name: /Tickets & registrations/ })).toContainText("Sign-in required");
  await expect(shortcuts.getByRole("link", { name: /Tickets & registrations/ })).toHaveAttribute("href", "/my-events");
  // Inspect contact destinations; never activate mail, telephone or external map links.
  await expect(page.locator('main a[href^="mailto:"]')).toHaveAttribute("href", "mailto:ieee@sahrdaya.ac.in");
  await shortcuts.getByRole("link", { name: /Verify a certificate/ }).click();
  await expect(page).toHaveURL(/\/verify$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("policy contents and ordered lists work without JavaScript", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await page.goto(`${baseURL}/privacy-policy`);
    await expect(page.getByRole("navigation", { name: "Policy contents" })).not.toBeVisible();
    await page.locator("summary").click();
    const contents = page.getByRole("navigation", { name: "Policy contents" });
    await contents.getByRole("link", { name: "How we use information", exact: true }).click();
    await expect(page).toHaveURL(/#policy-section-2$/);
    await expect(page.getByRole("heading", { name: "How we use information", exact: true })).toBeInViewport();
    expect(await page.locator("article ol").first().evaluate(node => getComputedStyle(node).listStyleType)).toBe("decimal");
    await page.reload();
    await expect(page.getByRole("heading", { name: "How we use information", exact: true })).toBeInViewport();
  } finally { await context.close(); }
});

test("desktop policy contents map every section and retain a readable column", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/privacy-policy");
  const contents = page.getByRole("navigation", { name: "Policy contents" });
  const headings = await page.locator("article h2").allTextContents();
  await expect(contents.getByRole("link")).toHaveCount(headings.length);
  await contents.getByRole("link", { name: "Privacy contact", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Privacy contact", exact: true })).toBeInViewport();
  await expect(contents).toBeInViewport();
  expect((await page.locator("article").boundingBox())!.width).toBeLessThan(850);
});

for (const width of [320, 390, 768, 1440]) {
  test(`support, catalog and policies fit ${width}px with complete titles`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/contact", "/pricing", "/privacy-policy", "/terms-and-conditions", "/refund-and-cancellation-policy", "/shipping-and-delivery-policy", "/about"]) {
      const response = await page.goto(path);
      expect(response?.ok(), path).toBeTruthy();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), path).toBeLessThanOrEqual(1);
      if (path === "/pricing") {
        const clipped = await page.locator("main h3").evaluateAll(nodes => nodes.filter(node => getComputedStyle(node).textOverflow === "ellipsis" || node.scrollWidth > node.clientWidth + 1).map(node => node.textContent));
        expect(clipped).toEqual([]);
        const policies = page.getByRole("navigation", { name: "Pricing policies" });
        await expect(policies.getByRole("link")).toHaveCount(2);
        for (const link of await policies.getByRole("link").all()) {
          expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        }
      }
    }
  });
}
