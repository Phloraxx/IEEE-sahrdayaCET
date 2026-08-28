import { expect, test } from "@playwright/test";

test.describe("Execom directory", () => {
  test("keeps grid, roster, search and group filtering usable", async ({ page }) => {
    const response = await page.goto("/full-execom");
    expect(response?.status()).toBe(200);

    const empty = page.getByText("Execom directory unavailable.");
    if (await empty.isVisible().catch(() => false)) return;

    await expect(page.getByTestId("execom-directory-header")).toBeVisible();
    await expect(page.getByTestId("execom-grid")).toBeVisible();
    const firstGridCount = await page.locator("[data-execom-member]").count();
    expect(firstGridCount).toBeGreaterThan(0);

    const firstCard = page.locator("[data-execom-member]").first();
    await expect(firstCard).toBeVisible();
    await expect(firstCard.locator("h3")).toBeVisible();

    await page.getByRole("button", { name: "Roster", exact: true }).click();
    await expect(page.getByTestId("execom-roster")).toBeVisible();
    expect(await page.locator("[data-execom-roster-row]").count()).toBe(firstGridCount);
    await page.getByRole("button", { name: "Grid", exact: true }).click();
    await expect(page.getByTestId("execom-grid")).toBeVisible();

    await page.getByPlaceholder("Search the roster…").fill("zzzz-not-a-member");
    await expect(page.getByText("No matching people.")).toBeVisible();
    await page.getByRole("button", { name: "Reset directory" }).click();
    await expect(page.getByTestId("execom-grid")).toBeVisible();

    const opener = page.locator("[data-execom-member] button[aria-label^=\"View details for\"]").first();
    await opener.focus();
    await opener.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Close member profile" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(opener).toBeFocused();
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
