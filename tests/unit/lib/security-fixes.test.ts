import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { safeNext } from "@/routes/auth.google";
import { readJson, MAX_JSON_BYTES } from "@/server/http/api";
import { __dbTesting, query, closeDatabase } from "@/lib/db.server";

/**
 * Regression tests for the audit fixes. Each one fails against the code before
 * the fix, which is the point: they name the exact behaviour that was wrong.
 */

describe("OAuth next parameter", () => {
	it("keeps a plain path", () => {
		expect(safeNext("/admin/dashboard")).toBe("/admin/dashboard");
		expect(safeNext("/")).toBe("/");
	});

	it("refuses protocol-relative and backslash-smuggled hosts", () => {
		// `//evil.com` was already blocked; `/\evil.com` was not, and the WHATWG URL
		// parser resolves it to https://evil.com/.
		expect(safeNext("//evil.com")).toBe("/");
		expect(safeNext("/\\evil.com")).toBe("/");
		expect(safeNext("/\\/evil.com")).toBe("/");
		expect(safeNext("https://evil.com")).toBe("/");
		expect(safeNext("javascript:alert(1)")).toBe("/");
		expect(new URL("/\\evil.com", "https://staging.example").host).toBe("evil.com");
	});
});

describe("JSON body size cap", () => {
	it("rejects a body that declares more than the cap", async () => {
		const request = new Request("http://internal/x", {
			method: "POST",
			headers: { "Content-Type": "application/json", "Content-Length": String(MAX_JSON_BYTES + 1) },
			body: "{}",
		});
		await expect(readJson(request)).rejects.toMatchObject({ status: 413 });
	});

	it("accepts a small body", async () => {
		const request = new Request("http://internal/x", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ hello: "world" }),
		});
		await expect(readJson(request)).resolves.toEqual({ hello: "world" });
	});
});

describe("statement cache bound", () => {
	beforeAll(() => {
		process.env.SQLITE_PATH = ":memory:";
		process.env.APP_SECRET = "test-secret-that-is-at-least-32-bytes-long";
		process.env.GOOGLE_CLIENT_ID = "test";
		process.env.GOOGLE_CLIENT_SECRET = "test";
	});
	afterAll(() => closeDatabase());

	it("never grows past the limit, even with unbounded distinct SQL", async () => {
		// The generic collection endpoint mints a new statement per filter shape, so
		// the cache must be bounded or it is a memory-exhaustion path.
		for (let i = 0; i < __dbTesting.cacheLimit + 50; i += 1) {
			// pi-lens-ignore: sql-injection — a literal integer, and the point of the
			// test is that each string is distinct.
			await query(`SELECT ${i} AS n`);
		}
		expect(__dbTesting.cacheSize()).toBeLessThanOrEqual(__dbTesting.cacheLimit);
	});
});

describe("rate limiting", () => {
	it("allows up to the limit inside the window, then refuses", async () => {
		const { allow, __testing } = await import("@/server/http/rate-limit");
		__testing.reset();
		const rule = { limit: 3, windowMs: 60_000 };
		expect(allow("k", rule, 1000)).toBe(true);
		expect(allow("k", rule, 1001)).toBe(true);
		expect(allow("k", rule, 1002)).toBe(true);
		expect(allow("k", rule, 1003)).toBe(false);
		// A new window resets the allowance.
		expect(allow("k", rule, 62_000)).toBe(true);
	});

	it("keys buckets independently per client", async () => {
		const { allow, __testing } = await import("@/server/http/rate-limit");
		__testing.reset();
		const rule = { limit: 1, windowMs: 60_000 };
		expect(allow("a", rule, 1000)).toBe(true);
		expect(allow("a", rule, 1001)).toBe(false);
		expect(allow("b", rule, 1001)).toBe(true);
	});

	it("classifies auth, webhook and writes, but not reads", async () => {
		const { ruleFor } = await import("@/server/http/rate-limit");
		const req = (path: string, method = "GET") => new Request(`http://x${path}`, { method });
		expect(ruleFor(req("/auth/google"))?.limit).toBe(20);
		expect(ruleFor(req("/api/webhooks/paygate", "POST"))?.limit).toBe(120);
		expect(ruleFor(req("/api/collections/events", "POST"))?.limit).toBe(120);
		expect(ruleFor(req("/api/collections/events"))).toBeNull();
		expect(ruleFor(req("/events"))).toBeNull();
	});
});
