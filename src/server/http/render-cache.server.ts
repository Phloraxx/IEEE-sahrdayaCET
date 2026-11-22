/**
 * Server-side cache for anonymous public HTML.
 *
 * The public site is server-rendered and, by design, the document carries no
 * user state — auth is resolved after hydration. That is what makes it safe to
 * hand the same bytes to every signed-out visitor, and it is the same allow-list
 * (`isCacheablePublicDocument`) the shared-cache headers already use.
 *
 * This is *not* a replacement for the edge cache. It exists because the origin
 * currently re-renders the events listing on every request: 82 ms of CPU each,
 * which caps one Node process at ~13 req/s no matter the concurrency. A 45 second
 * render cache turns that into a string copy.
 *
 * The one subtlety is the CSP nonce. The document embeds a per-response nonce in
 * its inline scripts and the header authorises exactly that value, so a cached
 * body cannot be served with a fresh CSP header unchanged. Each entry stores the
 * nonce it was rendered with; a hit rewrites every occurrence to the new nonce
 * and recomputes the header, which keeps the nonce unique per response (the whole
 * point of a nonce) while still reusing the rendered markup. If the rewrite finds
 * nothing — a corrupt or rewritten entry — the entry is ignored and the request
 * renders normally rather than serving a page whose scripts the CSP blocks.
 *
 * Bounds are deliberate: a short TTL, a fixed entry count, and a byte budget, so
 * this can never become the largest thing in the process.
 */

const HOP_HEADERS = new Set([
	"connection",
	"content-encoding",
	"content-length",
	"date",
	"keep-alive",
	"set-cookie",
	"transfer-encoding",
]);

const MAX_ENTRY_BYTES = 2 * 1024 * 1024;

export interface CachedDocument {
	status: number;
	headers: Array<[string, string]>;
	body: string;
	/** The CSP nonce the body was rendered with. */
	nonce: string;
	storedAt: number;
	bytes: number;
}

export interface RenderCacheStats {
	entries: number;
	bytes: number;
	hits: number;
	misses: number;
	evictions: number;
}

interface CacheState {
	entries: Map<string, CachedDocument>;
	hits: number;
	misses: number;
	evictions: number;
}

interface CacheGlobal {
	__ieeeRenderCache?: CacheState;
}

const globalForCache = globalThis as typeof globalThis & CacheGlobal;

function state(): CacheState {
	if (!globalForCache.__ieeeRenderCache) {
		globalForCache.__ieeeRenderCache = { entries: new Map(), hits: 0, misses: 0, evictions: 0 };
	}
	return globalForCache.__ieeeRenderCache;
}

function positiveNumber(raw: string | undefined, fallback: number): number {
	const parsed = Number.parseFloat(String(raw ?? ""));
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/** `0` disables the cache entirely. */
export function renderCacheTtlMs(): number {
	return positiveNumber(process.env.RENDER_CACHE_TTL_SECONDS, 45) * 1000;
}

function maxEntries(): number {
	return Math.max(1, Math.floor(positiveNumber(process.env.RENDER_CACHE_MAX_ENTRIES, 50)));
}

function maxBytes(): number {
	return Math.max(0, positiveNumber(process.env.RENDER_CACHE_MAX_BYTES, 32 * 1024 * 1024));
}

/**
 * Cache key, or `null` when the request must not be served from cache.
 *
 * Only a bare GET document is cacheable: query strings can change the result
 * (and are not in the allow-list's remit), and the host is part of the key so a
 * preview host can never be served a production document.
 */
export function renderCacheKey(request: Request): string | null {
	if (request.method !== "GET") return null;
	const url = new URL(request.url);
	if (url.search) return null;
	return `${url.host}${url.pathname}`;
}

export function renderCacheLookup(key: string, nowMs = Date.now()): CachedDocument | null {
	const ttl = renderCacheTtlMs();
	if (ttl <= 0) return null;

	const current = state();
	const entry = current.entries.get(key);
	if (!entry) return null;
	if (nowMs - entry.storedAt > ttl) {
		current.entries.delete(key);
		return null;
	}

	// Touch: Map preserves insertion order, so re-inserting moves it to the end
	// and eviction stays least-recently-used.
	current.entries.delete(key);
	current.entries.set(key, entry);
	current.hits += 1;
	return entry;
}

export function renderCacheStore(
	key: string,
	document: Omit<CachedDocument, "storedAt" | "bytes">,
	nowMs = Date.now(),
): void {
	if (renderCacheTtlMs() <= 0) return;
	if (!document.body) return;

	const bytes = Buffer.byteLength(document.body, "utf8");
	if (bytes > MAX_ENTRY_BYTES) return;

	const current = state();
	current.entries.delete(key);
	current.entries.set(key, {
		...document,
		headers: document.headers.filter(([name]) => !HOP_HEADERS.has(name.toLowerCase())),
		storedAt: nowMs,
		bytes,
	});

	const budget = maxBytes();
	while (current.entries.size > maxEntries() || totalBytes(current) > budget) {
		const oldest = current.entries.keys().next().value as string | undefined;
		if (oldest === undefined) break;
		current.entries.delete(oldest);
		current.evictions += 1;
	}
}

function totalBytes(current: CacheState): number {
	let total = 0;
	for (const entry of current.entries.values()) total += entry.bytes;
	return total;
}

/** Count a cacheable request that had to render. */
export function renderCacheMiss(): void {
	const current = state();
	current.misses += 1;
}

export function renderCacheStats(): RenderCacheStats {
	const current = state();
	return {
		entries: current.entries.size,
		bytes: totalBytes(current),
		hits: current.hits,
		misses: current.misses,
		evictions: current.evictions,
	};
}

/** Tests only. */
export function clearRenderCache(): void {
	const current = state();
	current.entries.clear();
	current.hits = 0;
	current.misses = 0;
	current.evictions = 0;
}
