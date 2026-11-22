import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
	clearRenderCache,
	renderCacheKey,
	renderCacheLookup,
	renderCacheMiss,
	renderCacheStats,
	renderCacheStore,
} from "../../src/server/http/render-cache.server";

const ENV = ["RENDER_CACHE_TTL_SECONDS", "RENDER_CACHE_MAX_ENTRIES", "RENDER_CACHE_MAX_BYTES"] as const;
const saved = Object.fromEntries(ENV.map((key) => [key, process.env[key]]));

function document(body = "<html>ok</html>", nonce = "old-nonce") {
	return {
		status: 200,
		headers: [
			["Content-Type", "text/html"],
			["Cache-Control", "public, s-maxage=60"],
			["Content-Length", "999"],
			["Set-Cookie", "should=not-be-stored"],
			["Content-Encoding", "br"],
		] as Array<[string, string]>,
		body,
		nonce,
	};
}

beforeEach(() => {
	clearRenderCache();
	delete process.env.RENDER_CACHE_TTL_SECONDS;
	delete process.env.RENDER_CACHE_MAX_ENTRIES;
	delete process.env.RENDER_CACHE_MAX_BYTES;
});

afterEach(() => {
	for (const key of ENV) {
		const value = saved[key];
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	clearRenderCache();
});

describe("render cache keys", () => {
	it("caches a bare GET document and nothing else", () => {
		expect(renderCacheKey(new Request("https://x.test/events"))).toBe("x.test/events");
		expect(renderCacheKey(new Request("https://x.test/events?page=2"))).toBeNull();
		expect(renderCacheKey(new Request("https://x.test/events", { method: "POST" }))).toBeNull();
		expect(renderCacheKey(new Request("https://x.test/events", { method: "HEAD" }))).toBeNull();
	});

	it("keeps hosts apart", () => {
		expect(renderCacheKey(new Request("https://prod.test/events"))).not.toBe(
			renderCacheKey(new Request("https://preview.test/events")),
		);
	});
});

describe("render cache entries", () => {
	it("serves a stored entry until the TTL expires", () => {
		process.env.RENDER_CACHE_TTL_SECONDS = "1";
		renderCacheStore("host/events", document(), 1_000);
		expect(renderCacheLookup("host/events", 1_500)?.body).toBe("<html>ok</html>");
		expect(renderCacheLookup("host/events", 2_200)).toBeNull();
	});

	it("drops hop-by-hop and cookie headers on the way in", () => {
		renderCacheStore("host/events", document(), 1_000);
		const headers = new Map(renderCacheLookup("host/events", 1_100)?.headers ?? []);
		expect(headers.get("Content-Type")).toBe("text/html");
		expect(headers.has("Content-Length")).toBe(false);
		expect(headers.has("Set-Cookie")).toBe(false);
		expect(headers.has("Content-Encoding")).toBe(false);
	});

	it("is disabled when the TTL is zero", () => {
		process.env.RENDER_CACHE_TTL_SECONDS = "0";
		renderCacheStore("host/events", document(), 1_000);
		expect(renderCacheLookup("host/events", 1_001)).toBeNull();
	});

	it("evicts the least recently used entry at the entry cap", () => {
		process.env.RENDER_CACHE_MAX_ENTRIES = "2";
		renderCacheStore("a", document("a"), 1_000);
		renderCacheStore("b", document("b"), 1_001);
		// Touch a so b becomes least-recently-used.
		expect(renderCacheLookup("a", 1_002)?.body).toBe("a");
		renderCacheStore("c", document("c"), 1_003);
		expect(renderCacheLookup("b", 1_004)).toBeNull();
		expect(renderCacheLookup("a", 1_004)?.body).toBe("a");
		expect(renderCacheLookup("c", 1_004)?.body).toBe("c");
	});

	it("refuses an entry larger than the per-entry cap", () => {
		renderCacheStore("big", document("x".repeat(2 * 1024 * 1024 + 1)), 1_000);
		expect(renderCacheLookup("big", 1_001)).toBeNull();
	});

	it("reports hits, misses and bytes", () => {
		renderCacheStore("host/events", document(), 1_000);
		renderCacheLookup("host/events", 1_001);
		renderCacheLookup("host/missing", 1_001);
		renderCacheMiss();
		const stats = renderCacheStats();
		expect(stats.hits).toBe(1);
		expect(stats.misses).toBe(1);
		expect(stats.entries).toBe(1);
		expect(stats.bytes).toBeGreaterThan(0);
	});
});
