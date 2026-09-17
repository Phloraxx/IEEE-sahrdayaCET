import { expect, test } from "@playwright/test";

test.describe("mobile public navigation", () => {
  test("uses a persistent bottom dock and accessible More sheet", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/pricing");

    const dock = page.getByRole("navigation", { name: "Mobile site navigation" });
    await expect(dock).toBeVisible();
    for (const label of ["Home", "Events", "Societies", "Blog"]) {
      await expect(dock.getByRole("link", { name: label, exact: true })).toBeVisible();
    }
    const trigger = dock.getByRole("button", { name: "Open more navigation" });
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    const mascot = dock.locator('[data-mobile-mascot="dock"]');
    await expect(mascot).toBeVisible();

    const mascotGeometry = await mascot.evaluate((element) => {
      const mascotRect = element.getBoundingClientRect();
      const triggerRect = element.parentElement?.getBoundingClientRect();
      return {
        mascot: { top: mascotRect.top, bottom: mascotRect.bottom, left: mascotRect.left, right: mascotRect.right },
        trigger: triggerRect ? { top: triggerRect.top, bottom: triggerRect.bottom, left: triggerRect.left, right: triggerRect.right } : null,
      };
    });
    expect(mascotGeometry.trigger).not.toBeNull();
    expect(mascotGeometry.mascot.top).toBeGreaterThanOrEqual(mascotGeometry.trigger!.top);
    expect(mascotGeometry.mascot.bottom).toBeLessThanOrEqual(mascotGeometry.trigger!.bottom);
    expect(mascotGeometry.mascot.left).toBeGreaterThanOrEqual(mascotGeometry.trigger!.left);
    expect(mascotGeometry.mascot.right).toBeLessThanOrEqual(mascotGeometry.trigger!.right);

    const dockGeometry = await dock.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, width: rect.width };
    });
    expect(dockGeometry.bottom).toBe(844);
    expect(dockGeometry.width).toBe(390);

    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");

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
      return { x: rect.x, right: rect.right, bottom: rect.bottom, height: rect.height };
    });
    expect(geometry.x).toBeGreaterThanOrEqual(10);
    expect(geometry.right).toBeLessThanOrEqual(380);
    expect(geometry.bottom).toBeLessThanOrEqual(844);
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
    await page.getByRole("button", { name: "Open more navigation" }).click();
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
