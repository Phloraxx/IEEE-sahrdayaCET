/**
 * In-process token bucket.
 *
 * There is no rate limiting anywhere else, and the app runs as one Node process
 * behind Traefik, so a per-process bucket is the right size of fix: it stops a
 * single client from hammering `/auth/*`, the webhook or a write endpoint
 * without adding a dependency or a shared store.
 *
 * Keyed on the client address Cloudflare already forwards (`CF-Connecting-IP`,
 * falling back to the first `X-Forwarded-For` hop). A request with neither is
 * keyed on a constant, which degrades to one shared bucket rather than no limit.
 */

interface Bucket {
	count: number;
	resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Drop expired buckets so the map cannot grow without bound. */
function sweep(now: number): void {
	if (buckets.size < 5_000) return;
	for (const [key, bucket] of buckets) {
		if (bucket.resetAt <= now) buckets.delete(key);
	}
}

export interface RateLimitRule {
	/** Requests allowed per window. */
	limit: number;
	/** Window length in milliseconds. */
	windowMs: number;
}

export const RATE_LIMITS = {
	auth: { limit: 20, windowMs: 60_000 },
	webhook: { limit: 120, windowMs: 60_000 },
	write: { limit: 120, windowMs: 60_000 },
	/** Certificate rendering is CPU-heavy and public; keep it modest. */
	render: { limit: 30, windowMs: 60_000 },
	/**
	 * Image resizing is CPU-heavy too, and `?w=` creates a new URL per width.
	 * A page with ~10 poster images costs ~10 of these; the allowance leaves room
	 * for several page views a minute while stopping a sustained grind.
	 */
	resize: { limit: 90, windowMs: 60_000 },
} satisfies Record<string, RateLimitRule>;

export function clientKey(request: Request): string {
	const forwarded = request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Forwarded-For");
	const ip = forwarded?.split(",")[0]?.trim();
	return ip || "unknown";
}

/** True when the caller is inside the allowance. */
export function allow(key: string, rule: RateLimitRule, nowMs = Date.now()): boolean {
	sweep(nowMs);
	const bucket = buckets.get(key);
	if (!bucket || bucket.resetAt <= nowMs) {
		buckets.set(key, { count: 1, resetAt: nowMs + rule.windowMs });
		return true;
	}
	if (bucket.count >= rule.limit) return false;
	bucket.count += 1;
	return true;
}

/** Which rule (if any) applies to this request. */
export function ruleFor(request: Request): RateLimitRule | null {
	const url = new URL(request.url);
	const { pathname } = url;
	const method = request.method.toUpperCase();
	if (pathname.startsWith("/auth/")) return RATE_LIMITS.auth;
	if (pathname === "/api/webhooks/paygate") return RATE_LIMITS.webhook;
	if (pathname.startsWith("/c/") && /\.(png|pdf)$/.test(pathname)) return RATE_LIMITS.render;
	if (pathname.startsWith("/files/") && url.searchParams.has("w")) return RATE_LIMITS.resize;
	if (pathname.startsWith("/api/") && method !== "GET" && method !== "HEAD") {
		return RATE_LIMITS.write;
	}
	return null;
}

/** Exported for tests. */
export const __testing = { buckets, reset: () => buckets.clear() };
