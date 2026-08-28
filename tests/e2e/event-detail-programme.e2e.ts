import { expect, test } from "@playwright/test";

test.describe("event detail programme", () => {
  test("event detail inherits the programme visual system", async ({ page }) => {
    await page.goto("/events");
    const eventLink = page.locator('a[href^="/events/"]:not([href="/events/"])').first();
    await expect(eventLink).toBeVisible();
    const href = await eventLink.getAttribute("href");
    expect(href).toBeTruthy();

    const response = await page.goto(href!);
    expect(response?.ok()).toBeTruthy();
    await expect(page.getByTestId("event-programme-hero")).toBeVisible();
    await expect(page.getByText("About the event", { exact: true })).toBeVisible();
  });

  test("event detail remains overflow-free on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/events");
    const href = await page.locator('a[href^="/events/"]:not([href="/events/"])').first().getAttribute("href");
    expect(href).toBeTruthy();
    await page.goto(href!);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
