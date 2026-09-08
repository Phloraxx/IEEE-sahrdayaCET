import { expect, test } from "@playwright/test";

test.describe("mobile public navigation", () => {
  test("uses a contained top sheet with accessible mobile controls", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/pricing");

    const trigger = page.getByRole("button", { name: "Open menu" });
    await expect(trigger).toBeVisible();
    await trigger.click();

    const dialog = page.getByRole("dialog", { name: "Site navigation" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("navigation", { name: "Mobile primary navigation" }),
    ).toBeVisible();
    for (const label of ["HOME", "EVENTS", "SOCIETIES", "BLOG", "EXECOM"]) {
      await expect(
        dialog.getByRole("link", { name: new RegExp(label) }),
      ).toBeVisible();
    }
    await expect(dialog.getByRole("button", { name: "Sign in" })).toBeVisible();

    const geometry = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, right: rect.right, height: rect.height };
    });
    expect(geometry.x).toBeGreaterThanOrEqual(10);
    expect(geometry.right).toBeLessThanOrEqual(380);
    expect(geometry.height).toBeLessThan(844);

    const targetHeights = await dialog
      .locator("a, button")
      .evaluateAll((elements) =>
        elements.map((element) =>
          Math.round(element.getBoundingClientRect().height),
        ),
      );
    expect(
      targetHeights.filter((height) => height >= 44).length,
    ).toBeGreaterThanOrEqual(7);
    expect(
      await page.evaluate(() => getComputedStyle(document.body).overflow),
    ).toBe("hidden");

    for (let index = 0; index < 10; index += 1) {
      await page.keyboard.press("Tab");
      expect(
        await dialog.evaluate((element) =>
          element.contains(document.activeElement),
        ),
      ).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("stays usable on a short 320px phone without page overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 480 });
    await page.goto("/pricing");
    await page.getByRole("button", { name: "Open menu" }).click();
    const dialog = page.getByRole("dialog", { name: "Site navigation" });
    const geometry = await dialog.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      right: element.getBoundingClientRect().right,
    }));
    expect(geometry.clientHeight).toBeLessThanOrEqual(456);
    expect(geometry.scrollHeight).toBeGreaterThanOrEqual(geometry.clientHeight);
    expect(geometry.right).toBeLessThanOrEqual(308);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(320);
  });
});
