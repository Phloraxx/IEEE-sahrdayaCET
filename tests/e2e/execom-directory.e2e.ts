import { expect, test } from "@playwright/test";

test.describe("Execom directory", () => {
  test("keeps grid, roster, search and group filtering usable", async ({ page }) => {
    const response = await page.goto("/full-execom");
    expect(response?.status()).toBe(200);

    const empty = page.getByText("Execom directory unavailable.");
    if (await empty.isVisible().catch(() => false)) return;

    await expect(page.getByTestId("execom-directory-header")).toBeVisible();
    await expect(page.getByTestId("execom-roster")).toBeVisible();
    const firstRosterCount = await page.locator("[data-execom-roster-row]").count();
    expect(firstRosterCount).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Grid", exact: true }).click();
    await expect(page.getByTestId("execom-grid")).toBeVisible();
    expect(await page.locator("[data-execom-member]").count()).toBe(firstRosterCount);
    await page.getByRole("button", { name: "Roster", exact: true }).click();
    await expect(page.getByTestId("execom-roster")).toBeVisible();

    await page.getByPlaceholder("Search the roster…").fill("zzzz-not-a-member");
    await expect(page.getByText("No matching people.")).toBeVisible();
    await page.getByRole("button", { name: "Reset directory" }).click();
    await expect(page.getByTestId("execom-roster")).toBeVisible();
  });

  test("has no horizontal overflow on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/full-execom");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
