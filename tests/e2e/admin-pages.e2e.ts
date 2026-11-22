/**
 * Admin pages against the ported app.
 *
 * The older `admin-authenticated.e2e.ts` targets the PocketBase architecture:
 * it refreshes a JWT at `/api/collections/users/auth-refresh` and drops
 * `pocketbase_auth` into localStorage. Neither exists any more — auth is an
 * opaque token in a `__Host-` cookie, verified server-side — so that spec cannot
 * pass and is skipped without a fixture token.
 *
 * This spec proves what the port actually needs: every admin page renders, and
 * every data call it makes answers. Any non-2xx on an `/api/` request is a
 * failure — a 404 means a surface is still unported, a 400 means the endpoint
 * could not compile the filter or sort the page sent. The network log is
 * written to `runs/playwright-admin/network.json` as evidence.
 */

import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DB_PATH = process.env.E2E_SQLITE_PATH || "";
const COOKIE = process.env.E2E_SESSION_COOKIE || "__Host-ieee_session";
const COOKIE_DOMAIN = process.env.E2E_COOKIE_DOMAIN || "127.0.0.1";
const OUT_DIR = process.env.E2E_NETWORK_LOG_DIR || "runs/playwright-admin";

const PAGES: Array<[string, RegExp]> = [
	["/admin/dashboard", /dashboard|operations|attention|event/i],
	["/admin/events", /event/i],
	["/admin/registrations", /registration|attendee/i],
	["/admin/payments", /payment|collected/i],
	["/admin/certificates", /certificate/i],
	["/admin/societies", /society|societies/i],
	["/admin/execom", /execom|committee|member/i],
	["/admin/users", /user|member/i],
	["/admin/access", /access|role|assignment/i],
	["/admin/check-in", /check.?in|attendee/i],
	["/admin/data-health", /health|integrity|data/i],
];

interface NetworkEntry {
	page: string;
	method: string;
	url: string;
	status: number;
	resourceType: string;
}

test.describe("Admin pages on the ported app", () => {
	test.skip(!DB_PATH, "E2E_SQLITE_PATH is not configured");

	let token = "";
	const network: NetworkEntry[] = [];

	test.beforeAll(() => {
		// Mint a session directly in the database. The app stores only the sha256
		// of the token, so the plaintext never has to leave this process.
		const db = new Database(DB_PATH, { readonly: false });
		try {
			const admin = db
				.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1")
				.get() as { id: string } | undefined;
			if (!admin) throw new Error("no admin user in the migrated database");

			token = randomBytes(32).toString("base64url");
			const hash = createHash("sha256").update(token).digest("hex");
			const now = new Date();
			const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000);
			db.prepare(
				`INSERT INTO sessions (id, token_hash, user_id, created_at, expires_at, last_seen_at, user_agent, ip_hash)
				 VALUES (?,?,?,?,?,?,?,?)`,
			).run(
				randomBytes(16).toString("hex"),
				hash,
				admin.id,
				now.toISOString(),
				expires.toISOString(),
				now.toISOString(),
				"playwright",
				"",
			);
		} finally {
			db.close();
		}
		mkdirSync(OUT_DIR, { recursive: true });
	});

	test.beforeEach(async ({ context }) => {
		await context.addCookies([
			{
				name: COOKIE,
				value: Buffer.from(JSON.stringify(token)).toString("base64"),
				domain: COOKIE_DOMAIN,
				path: "/",
				httpOnly: true,
				secure: true,
				sameSite: "Lax",
			},
		]);
	});

	test.afterAll(() => {
		writeFileSync(join(OUT_DIR, "network.json"), JSON.stringify(network, null, 2));
	});

	for (const [path, expected] of PAGES) {
		test(`${path} renders with no failed data call`, async ({ page }) => {
			const consoleErrors: string[] = [];
			const failed: NetworkEntry[] = [];

			page.on("console", (message) => {
				if (message.type() === "error") consoleErrors.push(message.text());
			});
			page.on("response", (response) => {
				const request = response.request();
				const url = response.url();
				if (!url.includes("/api/")) return;
				const entry: NetworkEntry = {
					page: path,
					method: request.method(),
					url: url.replace("http://127.0.0.1:3100", ""),
					status: response.status(),
					resourceType: request.resourceType(),
				};
				network.push(entry);
				// Any non-2xx is a data call that did not answer: a 404 is an
				// unported surface, a 400 is a filter/sort the endpoint could not
				// compile, a 5xx is a bug. The actor is a full admin, so a 401/403
				// here would itself be a finding rather than an expected refusal.
				if (entry.status >= 400) failed.push(entry);
			});

			const response = await page.goto(path, { waitUntil: "networkidle" });
			expect(response?.status(), `${path} should not 5xx`).toBeLessThan(500);

			// The page rendered something recognisable, not an error boundary.
			await expect(page.locator("body")).toContainText(expected, { timeout: 15_000 });

			// Every data call answers. The network log keeps the full evidence.
			expect(failed, `${path} made a failed data call: ${JSON.stringify(failed)}`).toEqual([]);

			// A console error that names a failed fetch is a real failure; other
			// console noise (React dev warnings) is not what this spec is about.
			const dataErrors = consoleErrors.filter((text) =>
				/failed to fetch|404|not found|no route matches/i.test(text),
			);
			expect(dataErrors, `${path} logged a data error`).toEqual([]);
		});
	}
});
