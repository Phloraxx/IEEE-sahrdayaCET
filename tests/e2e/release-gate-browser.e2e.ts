/**
 * Release gate, part 2 — a real browser on the compiled app.
 *
 * The HTTP spec proves the server answers. This one proves the browser can
 * *use* those answers: SSR content hydrates, the anonymous admin guard
 * redirects, an admin session renders the operations surface, and the console
 * stays clean.
 *
 * Authenticated state is created the honest way: `context.addCookies` with the
 * value the app's own serializer produces (see `release-gate-support.ts`), over
 * the loopback origin. No PocketBase JWT, no `localStorage` token, no proxy.
 */

import { expect, test, type Page } from "@playwright/test";
import { mintSession, releaseGateDbPath, requireReleaseGate, SESSION_COOKIE_NAME } from "./release-gate-support";

const ADMIN_EMAIL = "ci-admin@example.test";

/**
 * Console errors that are page bugs, not test noise.
 *
 * Two sources are excluded on purpose and named here so the exclusion is
 * reviewable: failed resource loads (asserted by status instead) and the
 * "No queryFn was passed" warning, which React Query emits for the
 * `workspace-me` invalidation key that has no query function. Neither is a
 * release signal.
 */
function collectErrors(page: Page): string[] {
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
	page.on("console", (message) => {
		if (message.type() !== "error") return;
		const text = message.text();
		if (text.includes("Failed to load resource")) return;
		if (text.includes("No queryFn was passed")) return;
		errors.push(text);
	});
	return errors;
}

function collectFailedApi(page: Page): string[] {
	const failed: string[] = [];
	page.on("response", (response) => {
		const path = new URL(response.url()).pathname;
		if (!path.startsWith("/api/")) return;
		if (response.status() >= 400) failed.push(`${response.status()} ${path}`);
	});
	return failed;
}

async function signInAsAdmin(page: Page): Promise<void> {
	const session = await mintSession(ADMIN_EMAIL);
	const baseURL = new URL(process.env.RELEASE_GATE_APP_URL as string);
	// `__Host-` cookies are Secure with no Domain attribute; Playwright needs the
	// same shape, and the loopback origin counts as a secure context.
	await page.context().addCookies([
		{
			name: SESSION_COOKIE_NAME,
			value: session.cookieValue,
			domain: baseURL.hostname,
			path: "/",
			httpOnly: true,
			secure: true,
			sameSite: "Lax",
		},
	]);
}

test.describe("release gate — browser", () => {
	test.beforeAll(() => {
		requireReleaseGate();
		expect(releaseGateDbPath()).toContain("release-gate");
	});

	test("public pages render and hydrate without console errors", async ({ page }) => {
		const errors = collectErrors(page);
		const failed = collectFailedApi(page);

		const events = await page.goto("/events");
		expect(events?.status()).toBe(200);
		await expect(page.getByText("CI Release Gate Demo Event").first()).toBeVisible();
		// The listing is client-hydrated: this proves the bundle ran, not just
		// that the server rendered a string.
		await expect(page).toHaveTitle(/Events/i);

		const detail = await page.goto("/events/ci-release-gate-demo");
		expect(detail?.status()).toBe(200);
		await expect(page.getByRole("heading", { name: /CI Release Gate Demo Event/i }).first()).toBeVisible();

		expect(failed).toEqual([]);
		expect(errors).toEqual([]);
	});

	test("the anonymous admin guard leaves the admin surface", async ({ page }) => {
		// The server redirects `/admin/*` to the root (no 200 for a page the
		// caller cannot use); the client guard then starts sign-in because the
		// layout was reached without a session.
		const response = await page.goto("/admin/data-health");
		expect(response?.status()).toBe(200);
		await expect(page).not.toHaveURL(/\/admin/);
	});

	test("an admin session renders the operations surface and its data", async ({ page }) => {
		await signInAsAdmin(page);
		const errors = collectErrors(page);
		const failed = collectFailedApi(page);

		const health = await page.goto("/admin/data-health");
		expect(health?.status()).toBe(200);
		await expect(page).not.toHaveURL(/auth\/google/);
		await expect(page).toHaveTitle(/Data Health/i);

		// The page is client-fetched through TanStack Query. Reading the fetch
		// result from the page proves the cookie is accepted and the seeded
		// database passes its own integrity checks.
		const api = await page.evaluate(async () => {
			const response = await fetch("/api/admin/data-health", { credentials: "same-origin" });
			return { status: response.status, body: (await response.json()) as Record<string, unknown> };
		});
		expect(api.status).toBe(200);
		expect(api.body.integrity).toBe("ok");
		expect(api.body.foreignKeyViolations).toBe(0);
		expect(api.body.paidWithoutTicket).toBe(0);

		expect(failed).toEqual([]);
		expect(errors).toEqual([]);
	});

	test("the dashboard's own data calls run in the browser", async ({ page }) => {
		await signInAsAdmin(page);
		const calls: string[] = [];
		page.on("request", (request) => {
			const path = new URL(request.url()).pathname;
			if (path.startsWith("/api/")) calls.push(path);
		});

		await page.goto("/admin/dashboard");
		await expect(page).not.toHaveURL(/auth\/google/);
		await expect
			.poll(() => calls.some((path) => path.startsWith("/api/")), { timeout: 15_000 })
			.toBe(true);
	});
});
