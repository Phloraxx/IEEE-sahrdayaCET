import { expect, test } from "@playwright/test";

async function firstGenericSocietyHref(page: import("@playwright/test").Page) {
  await page.goto("/societies");
  const link = page.locator('a[href^="/societies/"]:not([href="/societies/wie"])').first();
  if (!(await link.count())) return null;
  return link.getAttribute("href");
}

test.describe("generic society profile", () => {
  test("opens from the directory into the shared profile system", async ({ page }) => {
    const href = await firstGenericSocietyHref(page);
    test.skip(!href, "No generic society exists in this clean-room dataset");
    await page.goto(href!);
    await expect(page.getByTestId("society-profile-hero")).toBeVisible();
    await expect(page.locator("#people")).toBeVisible();
    await expect(page.locator("#activity")).toBeVisible();
    await expect(page.getByText("Faculty Advisor Message", { exact: true })).toHaveCount(0);
    const eventLink = page.locator('#activity a[href^="/events/"]').first();
    if (await eventLink.count()) await expect(eventLink).toHaveAttribute("href", /\/events\//);
  });

  test("keeps the generic profile overflow-free on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const href = await firstGenericSocietyHref(page);
    test.skip(!href, "No generic society exists in this clean-room dataset");
    await page.goto(href!);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await expect(page.getByTestId("society-profile-hero")).toBeVisible();
  });

  test("keeps WIE on its bespoke experience when WIE exists", async ({ page }) => {
    const response = await page.goto("/societies/wie");
    test.skip(!response?.ok(), "WIE is not present in this clean-room dataset");
    await expect(page.getByTestId("society-profile-hero")).toHaveCount(0);
    await expect(page.getByText(/Women in Engineering/i).first()).toBeVisible();
  });
});
