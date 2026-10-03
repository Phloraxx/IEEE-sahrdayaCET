import { expect, test, type Page } from "@playwright/test";

async function genericEventPath(page: Page) {
  await page.goto("/events");
  const paths = await page.locator('a[href^="/events/"]').evaluateAll(nodes => nodes.map(node => node.getAttribute("href")));
  const path = paths.find(path => path && /^\/events\/[^/?#]+$/.test(path) && path !== "/events/sustainx");
  expect(path, "Need a generic published event").toBeTruthy();
  return path!;
}

test("empty verification is required and keyboard results receive focus", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/verify");
  const input = page.getByRole("textbox", { name: "Credential ID", exact: true });
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(page).toHaveURL(/\/verify$/);
  await expect(input).toBeFocused();
  expect(await input.evaluate(node => (node as HTMLInputElement).validity.valueMissing)).toBe(true);
  await input.fill("   ");
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  expect(await input.evaluate(node => (node as HTMLInputElement).validity.patternMismatch)).toBe(true);
  await expect(page).toHaveURL(/\/verify$/);
  await input.fill("  audit-first  ");
  await input.press("Enter");
  const result = page.locator("#verification-result");
  await expect(result).toContainText("Invalid credential");
  await expect(result).toContainText("Checked ID: AUDIT-FIRST");
  await expect(result).toBeFocused();
  await expect(result).toBeInViewport();
  expect((await result.boundingBox())!.y).toBeLessThan((await page.getByRole("heading", { name: "How it works", exact: true }).boundingBox())!.y);
  await expect(input).toHaveValue("AUDIT-FIRST");
  await expect(result.getByRole("link", { name: "contact the branch" })).toHaveAttribute("href", "/contact");
});

test("verification input follows Back and Forward between submitted IDs", async ({ page }) => {
  await page.goto("/verify");
  const input = page.getByRole("textbox", { name: "Credential ID", exact: true });
  for (const id of ["audit-first", "audit-second"]) {
    await input.fill(id);
    await page.getByRole("button", { name: "Verify", exact: true }).click();
    await expect(page.locator("#verification-result")).toContainText(`Checked ID: ${id.toUpperCase()}`);
  }
  await page.goBack();
  await expect(input).toHaveValue("AUDIT-FIRST");
  await page.goForward();
  await expect(input).toHaveValue("AUDIT-SECOND");
  await page.reload();
  await expect(input).toHaveValue("AUDIT-SECOND");
});

test("pending lookup shows progress and prevents duplicate submissions", async ({ page }) => {
  await page.goto("/verify");
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/verify.data?*", async route => { await gate; await route.continue(); });
  try {
    await page.getByRole("textbox", { name: "Credential ID", exact: true }).fill("audit-pending");
    await page.getByRole("button", { name: "Verify", exact: true }).click();
    await expect(page.getByRole("button", { name: "Checking…", exact: true })).toBeDisabled();
    await expect(page.locator("#verification-result")).toHaveAttribute("aria-busy", "true");
  } finally { release(); }
  await expect(page.locator("#verification-result")).toContainText("Invalid credential");
  await expect(page.getByRole("button", { name: "Verify", exact: true })).toBeEnabled();
});

test("native verification submits and reveals its result without JavaScript", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await page.goto(`${baseURL}/verify`);
    await page.getByRole("textbox", { name: "Credential ID", exact: true }).fill("audit-native");
    await page.getByRole("button", { name: "Verify", exact: true }).click();
    await expect(page).toHaveURL(/#verification-result$/);
    await expect(page.locator("#verification-result")).toContainText("Invalid credential");
    await expect(page.locator("#verification-result")).toBeInViewport();
  } finally { await context.close(); }
});

test("invalid QR references offer a safe Credential ID lookup", async ({ page }) => {
  await page.goto(`/c/${"0".repeat(48)}`);
  await expect(page.getByRole("heading", { name: "Invalid credential", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Look up a Credential ID" }).click();
  await expect(page).toHaveURL(/\/verify$/);
  await expect(page.getByRole("textbox", { name: "Credential ID", exact: true })).toHaveValue("");
});

for (const width of [320, 390, 768, 1440]) {
  test(`verification and complete event facts fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/verify?id=${"audit-long-".repeat(30)}`);
    await expect(page.locator("#verification-result")).toContainText("Invalid credential");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const path = await genericEventPath(page);
    await page.goto(path);
    const facts = page.getByTestId("event-facts");
    await expect(facts.locator("dt")).toHaveCount(4);
    const clipped = await facts.locator("dd").evaluateAll(nodes => nodes.filter(node => getComputedStyle(node).webkitLineClamp !== "none" || node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1).map(node => node.textContent));
    expect(clipped).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    if (width < 768) expect((await facts.boundingBox())!.y + (await facts.boundingBox())!.height).toBeLessThanOrEqual((await page.getByTestId("event-artwork").boundingBox())!.y);
    else expect((await facts.boundingBox())!.y).toBeGreaterThanOrEqual((await page.getByTestId("event-artwork").boundingBox())!.y + (await page.getByTestId("event-artwork").boundingBox())!.height);
    expect((await page.getByTestId("event-programme-hero").getByRole("link").first().boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });
}

test("event title, navigation and artwork remain visible without JavaScript", async ({ page, browser, baseURL }) => {
  const path = await genericEventPath(page);
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  try {
    const baseline = await context.newPage();
    await baseline.goto(`${baseURL}${path}`);
    const title = baseline.getByRole("heading", { level: 1 });
    await expect(title).toBeVisible();
    for (const node of [title, baseline.getByTestId("event-artwork"), baseline.getByTestId("event-programme-hero").getByRole("link").first()]) {
      expect(await node.evaluate(node => {
        for (let parent: Element | null = node; parent; parent = parent.parentElement) if (Number(getComputedStyle(parent).opacity) === 0) return false;
        const rect = node.getBoundingClientRect();
        return rect.height > 0 && getComputedStyle(node).transform === "none";
      })).toBe(true);
    }
  } finally { await context.close(); }
});
