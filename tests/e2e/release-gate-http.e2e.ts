/**
 * Release gate, part 1 — the compiled app answers over HTTP.
 *
 * This is the browserless half of the authenticated gate. It talks to the
 * compiled server the way a browser does (same cookie encoding, same Origin
 * header on mutations) and asserts the contracts that must hold on every
 * release:
 *
 * 1. Every public route the site depends on server-renders with the seeded
 *    content — a build that renders a shell but no data fails here.
 * 2. `/healthz` reports the service contract.
 * 3. The session cookie is opaque: an anonymous caller and a forged cookie are
 *    told nothing, a real one gets the admin capability list.
 * 4. `Origin` is enforced on mutations: a foreign origin is refused while the
 *    session is valid.
 * 5. The collection surface answers filters, and its filter translator rejects
 *    SQL it does not understand (400, never 500, never a leak).
 * 6. Sign-in runs end to end against the gate's fake provider and lands an
 *    opaque, HttpOnly session; unrecognised states and provider errors fail
 *    closed.
 * 7. Logout is a server-side delete.
 *
 * Only the synthetic `*.test` accounts and the `ci-*` seed rows are used.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import Database from "better-sqlite3";
import { expect, test, type APIRequestContext } from "@playwright/test";
import {
	cookieHeader,
	mintSession,
	releaseGateDbPath,
	requireReleaseGate,
	SESSION_COOKIE_NAME,
	sessionExists,
} from "./release-gate-support";

const ADMIN_EMAIL = "ci-admin@example.test";

function appUrl(): string {
	return process.env.RELEASE_GATE_APP_URL as string;
}

async function anonymous(request: APIRequestContext, path: string) {
	return request.get(path, { maxRedirects: 0 });
}

async function asAdmin(request: APIRequestContext, path: string, headers: Record<string, string> = {}) {
	const session = await mintSession(ADMIN_EMAIL);
	return request.get(path, {
		headers: { cookie: cookieHeader(session), origin: appUrl(), ...headers },
		maxRedirects: 0,
	});
}

test.describe("release gate — HTTP contract", () => {
	test.beforeAll(() => {
		requireReleaseGate();
	});

	test("healthz reports the service, and a paused job runner does not fail it", async ({ request }) => {
		const response = await anonymous(request, "/healthz");
		expect(response.status()).toBe(200);
		const body = (await response.json()) as {
			ok: boolean;
			service: string;
			status: string;
			checks: Record<string, string>;
			degraded: boolean;
		};
		expect(body.ok).toBe(true);
		expect(body.service).toBe("web");
		// The gate runs with JOBS_ENABLED=0. Readiness is a database question:
		// a paused runner and an old backup are diagnostics (`checks`) and the
		// `degraded` flag, and must never turn a working app into a 503.
		expect(body.checks.database).toBe("ok");
		expect(body.checks).toHaveProperty("jobs");
		expect(body.degraded).toBe(true);
	});

	test("public pages server-render the seeded content", async ({ request }) => {
		const cases: Array<{ path: string; expect: RegExp[] }> = [
			{ path: "/", expect: [/IEEE Sahrdaya/] },
			{ path: "/events", expect: [/CI Release Gate Demo Event/] },
			{
				path: "/events/ci-release-gate-demo",
				expect: [/CI Release Gate Demo Event/, /application\/ld\+json/],
			},
			{ path: "/societies", expect: [/CI Test Society/] },
			{ path: "/societies/ci-test-society", expect: [/CI Test Society/] },
			{ path: "/full-execom", expect: [/<html/i] },
			{ path: "/about", expect: [/<html/i] },
		];

		for (const { path, expect: patterns } of cases) {
			const response = await anonymous(request, path);
			expect(response.status(), `${path} status`).toBe(200);
			const html = await response.text();
			for (const pattern of patterns) expect(html, `${path} must contain ${pattern}`).toMatch(pattern);
			// A non-production build must stay out of search indexes.
			expect(response.headers()["x-robots-tag"], `${path} robots`).toBe("noindex, nofollow");
		}
	});

	test("drafts and the sitemap stay out of the public surface", async ({ request }) => {
		const draft = await anonymous(request, "/events/ci-draft-should-not-list");
		expect(draft.status()).toBe(404);

		const events = await anonymous(request, "/api/collections/events?perPage=50");
		expect(events.status()).toBe(200);
		const body = (await events.json()) as { items: Array<{ slug: string }> };
		const slugs = body.items.map((item) => item.slug);
		expect(slugs).toContain("ci-release-gate-demo");
		expect(slugs).not.toContain("ci-draft-should-not-list");

		// Only production serves a sitemap; the gate is a test build.
		const sitemap = await anonymous(request, "/sitemap.xml");
		expect(sitemap.status()).toBe(404);

		const robots = await anonymous(request, "/robots.txt");
		expect(robots.status()).toBe(200);
		expect(await robots.text()).toMatch(/^User-agent: \*/);
	});

	test("an anonymous caller and a forged cookie learn nothing", async ({ request }) => {
		const anonymousSession = await anonymous(request, "/api/session");
		expect(anonymousSession.status()).toBe(200);
		expect(await anonymousSession.json()).toEqual({ user: null });

		const forged = await request.get("/api/session", {
			headers: { cookie: `${SESSION_COOKIE_NAME}=${Buffer.from("forged-token").toString("base64")}` },
		});
		expect(forged.status()).toBe(200);
		expect(await forged.json()).toEqual({ user: null });

		const guard = await request.get("/api/admin/data-health");
		expect(guard.status()).toBe(401);

		// The admin shell answers an anonymous request with an honest redirect to
		// the site root on the server, so a crawler or a no-JS client never sees a
		// 200 for a page it cannot use. The client guard then starts sign-in.
		const page = await anonymous(request, "/admin/data-health");
		expect(page.status()).toBe(302);
		expect(page.headers().location).toBe("/");
	});

	test("a real session resolves the admin capability set", async ({ request }) => {
		const session = await mintSession(ADMIN_EMAIL);
		const response = await request.get("/api/session", { headers: { cookie: cookieHeader(session) } });
		expect(response.status()).toBe(200);
		const body = (await response.json()) as {
			user: { email: string; role: string };
			capabilities: string[];
		};
		expect(body.user.email).toBe(ADMIN_EMAIL);
		expect(body.user.role).toBe("admin");
		expect(body.capabilities).toEqual(expect.arrayContaining(["reports.view", "events.edit", "checkin.manage"]));
		// The token itself is never echoed back.
		expect(JSON.stringify(body)).not.toContain(session.token);

		// The helper's encoding is what the app actually accepts, so a broken
		// cookie format fails loudly instead of silently reading as anonymous.
		expect(session.cookieValue).not.toBe(session.token);
	});

	test("the collection surface answers filters and refuses SQL", async ({ request }) => {
		const session = await mintSession(ADMIN_EMAIL);
		const headers = { cookie: cookieHeader(session), origin: appUrl() };

		const bySlug = await request.get("/api/collections/events?filter=" + encodeURIComponent("slug='ci-release-gate-demo'"), {
			headers,
		});
		expect(bySlug.status()).toBe(200);
		const bySlugBody = (await bySlug.json()) as { totalItems: number; items: Array<{ title: string }> };
		expect(bySlugBody.totalItems).toBe(1);
		expect(bySlugBody.items[0]?.title).toBe("CI Release Gate Demo Event");

		for (const filter of ["1=1;DROP TABLE users", "status='draft'||1=1", "title=1''; --"]) {
			const rejected = await request.get("/api/collections/events?filter=" + encodeURIComponent(filter), { headers });
			expect(rejected.status(), `filter ${filter}`).toBe(400);
		}

		const unknown = await request.get("/api/collections/not-a-collection", { headers });
		expect(unknown.status()).toBe(404);
		const missing = await request.get("/api/collections/events/no-such-event", { headers });
		expect(missing.status()).toBe(404);
	});

	test("a foreign Origin cannot mutate with a valid session", async ({ request }) => {
		const session = await mintSession(ADMIN_EMAIL);
		const denied = await request.post("/api/events/ci-event-published/pricing-preview", {
			headers: { cookie: cookieHeader(session), origin: "https://evil.example.test" },
			data: { isIeeeMember: false },
		});
		expect(denied.status()).toBe(403);

		const allowed = await request.post("/api/events/ci-event-published/pricing-preview", {
			headers: { cookie: cookieHeader(session), origin: appUrl() },
			data: { isIeeeMember: false },
		});
		expect(allowed.status()).toBe(200);
		expect(await allowed.json()).toMatchObject({ finalFeePaise: 0, discountSource: "none" });

		const body = await request.get("/api/session", { headers: { cookie: cookieHeader(session) } });
		expect((await body.json()).user?.email).toBe(ADMIN_EMAIL);
	});

	test("sign-in rejects an unrecognised state before contacting anyone", async ({ request }) => {
		// The callback is reachable by anyone, so every failure path must answer a
		// clean redirect and must never mint a session.
		const noCookie = await anonymous(request, "/auth/google/callback?code=ci-bogus&state=ci-anything");
		expect(noCookie.status()).toBe(302);
		expect(noCookie.headers().location).toBe("/?auth_error=bad_state");

		const providerError = await anonymous(request, "/auth/google/callback?error=access_denied");
		expect(providerError.headers().location).toBe("/?auth_error=access_denied");

		const missingCode = await anonymous(request, "/auth/google/callback?state=whatever");
		expect(missingCode.headers().location).toBe("/?auth_error=missing_code");
	});

	test("sign-in completes through the provider and establishes an opaque session", async ({ request }) => {
		const start = await anonymous(request, "/auth/google?next=/admin/data-health");
		expect(start.status()).toBe(302);
		const authorization = new URL(start.headers().location ?? "/");
		expect(authorization.origin).toBe("https://accounts.google.com");
		expect(authorization.searchParams.get("redirect_uri")).toBe(`${appUrl()}/auth/google/callback`);
		expect(authorization.searchParams.get("code_challenge_method")).toBe("S256");
		expect(authorization.searchParams.get("code_challenge")).toBeTruthy();
		expect(authorization.searchParams.get("client_id")).toBe("release-gate.apps.example.test");
		const state = authorization.searchParams.get("state") ?? "";
		expect(state).not.toBe("");
		// The signed state cookie stays HttpOnly, Secure and short-lived.
		const stateSetCookie = start.headersArray().find((header) => header.name.toLowerCase() === "set-cookie");
		expect(stateSetCookie?.value).toMatch(/^__Host-ieee_oauth=/);
		expect(stateSetCookie?.value).toContain("HttpOnly");
		expect(stateSetCookie?.value).toContain("Secure");

		// The provider is faked locally (`tests/ci/release-gate.mjs`): the token
		// exchange and the userinfo read run the app's real code against a fixed
		// identity, so the whole flow is exercised without Google.
		const callback = await request.get(
			`/auth/google/callback?code=release-gate-code&state=${encodeURIComponent(state)}`,
			{ headers: { cookie: stateSetCookie?.value.split(";")[0] ?? "" }, maxRedirects: 0 },
		);
		expect(callback.status()).toBe(302);
		expect(callback.headers().location).toBe("/admin/data-health");

		const setCookies = callback.headersArray().filter((header) => header.name.toLowerCase() === "set-cookie");
		const sessionCookieHeader = setCookies.map((header) => header.value).find((value) => value.startsWith(`${SESSION_COOKIE_NAME}=`));
		expect(sessionCookieHeader, "the callback must set the session cookie").toBeTruthy();
		const sessionCookie = sessionCookieHeader?.split(";")[0] ?? "";
		// Opaque: never the raw provider token, and signed by the app's serializer.
		const rawValue = sessionCookie.slice(SESSION_COOKIE_NAME.length + 1);
		expect(rawValue).not.toContain("release-gate-access-token");
		expect(rawValue.length).toBeGreaterThan(20);
		// The state cookie is cleared on the way out.
		expect(setCookies.map((header) => header.value).join("\n")).toMatch(/__Host-ieee_oauth=;|__Host-ieee_oauth=;/);

		const session = await request.get("/api/session", { headers: { cookie: sessionCookie } });
		expect(session.status()).toBe(200);
		const body = (await session.json()) as { user: { email: string; role: string }; capabilities: string[] };
		expect(body.user.email).toBe("provider-user@example.test");
		expect(body.user.role).toBe("user");
		// A plain user is not workspace staff.
		expect(body.capabilities).not.toContain("reports.view");
	});

	test("logout deletes the session server-side", async ({ request }) => {
		const session = await mintSession(ADMIN_EMAIL);
		expect(sessionExists(session.sessionId)).toBe(true);

		const logout = await request.post("/auth/logout", {
			headers: { cookie: cookieHeader(session), origin: appUrl() },
			maxRedirects: 0,
		});
		expect(logout.status()).toBe(302);
		expect(sessionExists(session.sessionId)).toBe(false);

		const after = await request.get("/api/session", { headers: { cookie: cookieHeader(session) } });
		expect(await after.json()).toEqual({ user: null });

		// GET is not a logout.
		const get = await request.get("/auth/logout", { headers: { cookie: cookieHeader(session) }, maxRedirects: 0 });
		expect(get.status()).toBe(405);
	});

	test("the build under test records the provenance CD verifies", async () => {
		// `build/build-info.json` is what CD reads out of the deployed image: the
		// commit and the commit tree CI built from (GIT_COMMIT / GIT_TREE). A
		// build with neither is a local build, which is allowed here and refused
		// by CD. When the harness supplies them, they must match exactly.
		const infoPath = resolve(process.cwd(), "build", "build-info.json");
		expect(existsSync(infoPath), "build/build-info.json must exist; run `bun run build`").toBe(true);
		const info = JSON.parse(readFileSync(infoPath, "utf8")) as {
			version: string;
			revision: string;
			tree: string;
		};
		expect(info.version).toBe("3.1.0");

		const expectedTree = process.env.RELEASE_GATE_EXPECT_TREE?.trim();
		const expectedCommit = process.env.RELEASE_GATE_EXPECT_COMMIT?.trim();
		if (expectedTree) expect(info.tree).toBe(expectedTree);
		if (expectedCommit) expect(info.revision).toBe(expectedCommit);
		if (info.tree) expect(info.tree).toMatch(/^[0-9a-f]{40}$/);
	});

	test("the gate runs on the synthetic database, not a copied environment", async () => {		// A guard against pointing the gate at a real database by accident: the
		// seed writes its own marker and never runs against an existing file.
		const path = releaseGateDbPath();
		expect(path).toContain("release-gate");
		const db = new Database(path, { readonly: true });
		try {
			const marker = db
				.prepare("SELECT name FROM users WHERE email = ?")
				.get(ADMIN_EMAIL) as { name: string } | undefined;
			expect(marker?.name).toBe("CI Admin");

			// The seed is a closed world: exactly the synthetic accounts.
			const emails = (db.prepare("SELECT email FROM users ORDER BY email").all() as Array<{ email: string }>).map(
				(row) => row.email,
			);
			expect(emails.every((email) => email.endsWith("@example.test"))).toBe(true);
		} finally {
			db.close();
		}
	});
});
