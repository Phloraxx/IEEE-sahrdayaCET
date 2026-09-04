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
  test("shows public audience, member pricing and preparation guidance", async ({ page }) => {
    const slug = process.env.E2E_EVENT_GUIDANCE_SLUG;
    test.skip(!slug, "Public guidance fixture is not configured");
    await page.goto(`/events/${slug}`);
    const guidance = page.getByTestId("event-attendee-guidance");
    await expect(guidance).toBeVisible();
    await expect(guidance.getByText("Semesters: S7")).toBeVisible();
    await expect(guidance.getByText(/Computer Science & Engineering/)).toBeVisible();
    await expect(guidance.getByRole("heading", { name: "₹160" })).toBeVisible();
    await expect(guidance.getByText(/20% off the regular ₹200 fee/)).toBeVisible();
    await expect(guidance.getByText("Bring a charged laptop")).toBeVisible();
    await expect(guidance.getByText("Install VS Code beforehand")).toBeVisible();
    await expect(guidance.getByText("Report to the lab 15 minutes early.")).toBeVisible();
  });

});
