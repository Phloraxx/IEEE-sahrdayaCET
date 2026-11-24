/**
 * Release gate, part 3 — the homepage's first paint, with JavaScript blocked.
 *
 * The other gate specs need scripts to hydrate. This one proves the opposite:
 * the identity and every section heading are in the server document, so the
 * page is useful to a crawler, to a visitor whose JS failed, and to a first
 * frame before hydration. A regression here is a visible blank hero in
 * production, which is why it belongs in the release gate rather than only in
 * the detailed homepage suite (`tests/e2e/home-first-paint.e2e.ts`).
 */

import { expect, test } from "@playwright/test";
import { requireReleaseGate } from "./release-gate-support";

test.describe("release gate — no-JS first paint", () => {
	test.beforeAll(() => {
		requireReleaseGate();
	});

	test("the server document carries the wordmark and every homepage section", async ({ request }) => {
		const response = await request.get("/");
		expect(response.status()).toBe(200);
		const html = await response.text();

		// The H1 is present on first paint: no reveal hook, no zero opacity.
		const h1 = /<h1[^>]*>\s*IEEE\s*<\/h1>/.exec(html)?.[0] ?? "";
		expect(h1).toContain("font-pixel");
		expect(h1).not.toContain("data-hero-reveal");
		expect(h1).not.toContain("opacity");

		for (const marker of ['id="events"', 'id="execom"', 'aria-label="Past events gallery"', "THE EXECOM"]) {
			expect(html, marker).toContain(marker);
		}
	});

	test("the identity and section headings are visible with scripts blocked", async ({ page }) => {
		await page.route("**/*.js", (route) => route.abort());
		await page.goto("/");

		const heading = page.getByRole("heading", { level: 1, name: "IEEE", exact: true });
		await expect(heading).toBeVisible();
		await expect
			.poll(() => heading.evaluate((element) => getComputedStyle(element).opacity))
			.toBe("1");
		await expect
			.poll(() => heading.evaluate((element) => getComputedStyle(element).animationName))
			.toBe("none");

		// Section landmarks resolve without hydration.
		await expect(page.locator("#events")).toHaveCount(1);
		await expect(page.locator("#execom")).toHaveCount(1);
	});
});
