import { expect, test } from "@playwright/test";

/**
 * The homepage's production contract, on the server document alone.
 *
 * Every section and the H1 are rendered by React Router's SSR, so the page is
 * useful with JavaScript blocked and for crawlers. Nothing below the hero is
 * withheld for performance: images defer through native `loading="lazy"`.
 */
test.describe("home first paint", () => {
  test("server document carries the wordmark and every homepage section", async ({ request }) => {
    const response = await request.get("/");
    expect(response.status()).toBe(200);
    const html = await response.text();

    // The h1 is in the document on its first line, with no reveal hook and no
    // zero opacity of any kind.
    const h1 = /<h1[^>]*>\s*IEEE\s*<\/h1>/.exec(html)?.[0] ?? "";
    expect(h1).toContain("font-pixel");
    expect(h1).not.toContain("data-hero-reveal");
    expect(h1).not.toContain("opacity");

    // Sections and their landmarks, in document order.
    for (const marker of [
      'id="events"',
      'id="execom"',
      'aria-label="Past events gallery"',
      "Now at Sahrdaya",
      "THE EXECOM",
      "Explore Events",
    ]) {
      expect(html, marker).toContain(marker);
    }
    // The curated rail is entirely in the document, copies included.
    expect(html.match(/Selected IEEE Sahrdaya event moment/g)).toHaveLength(7);
    expect(html).toContain('data-testid="curated-event-strip"');
    // And it defers through native lazy loading, not by withholding frames.
    expect(html).toMatch(/srcSet="[^"]*\/Events\/[^"]*-480w\.webp 480w/);
    expect(html).toContain('loading="lazy"');
  });

  test("shows the identity and the section headings with scripts blocked", async ({ page }) => {
    await page.route("**/*.js", (route) => route.abort());
    await page.goto("/");

    const heading = page.getByRole("heading", { level: 1, name: "IEEE", exact: true });
    await expect(heading).toBeVisible();
    // Fully opaque on the first frame: no animation, no fill-mode, no hide.
    await expect.poll(() => heading.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
    await expect.poll(() => heading.evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
    await expect(page.getByRole("heading", { name: "SAHRDAYA", exact: true }).first()).toBeVisible();

    // The whole page is usable without JavaScript.
    await expect(page.getByRole("heading", { name: /What's happening/i })).toBeAttached();
    await expect(page.getByRole("heading", { name: /behind the vision/i })).toBeAttached();
    await expect(page.getByRole("region", { name: "Past events gallery" })).toBeAttached();
    await expect(page.getByRole("link", { name: "Explore Events" })).toBeAttached();
  });

  test("serves gallery derivatives at the card ratio and falls back to the original", async ({ page, request }) => {
    const derivative = await request.get("/Events/542326117_17847004371557574_12824648908429865_n-480w.webp");
    expect(derivative.status()).toBe(200);
    const bytes = Buffer.from(await derivative.body());
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString("ascii")).toBe("WEBP");

    const original = await request.get("/Events/542326117_17847004371557574_12824648908429865_n.jpg?v=1");
    expect(original.status()).toBe(200);

    // A derivative that never arrives leaves the frame with its original and
    // its `alt`, so the photograph still shows and still reads.
    await page.route("**/*-480w.webp", (route) => route.fulfill({ status: 404, body: "" }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const firstFrame = page.getByTestId("curated-event-strip").locator("img").first();
    await firstFrame.scrollIntoViewIfNeeded();
    await expect(firstFrame).toHaveAttribute("alt", "Selected IEEE Sahrdaya event moment 1");
    await expect.poll(async () => firstFrame.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBeGreaterThan(0);
  });

  test("reveals the subordinate rows without motion when reduced motion is requested", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const heading = page.getByRole("heading", { level: 1, name: "IEEE", exact: true });
    await expect(heading).toBeVisible();
    await expect.poll(() => heading.evaluate((element) => getComputedStyle(element).transform)).toBe("none");
    const tagline = page.getByText("INNOVATE.", { exact: true });
    await expect(tagline).toBeVisible();
    await expect.poll(() => tagline.evaluate((element) => getComputedStyle(element).transform)).toBe("none");
    await expect.poll(() => tagline.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
  });
});
