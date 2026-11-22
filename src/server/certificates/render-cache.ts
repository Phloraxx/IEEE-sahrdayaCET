/**
 * Rendered certificate cache.
 *
 * `/c/:token/certificate.png|pdf` are public, and each render runs `sharp`
 * dozens of times (the name-fit loop) plus a full-canvas composite at
 * `compressionLevel: 9`. Nothing was cached, so one shared link was an
 * unauthenticated CPU amplifier.
 *
 * Keyed on the certificate's `credential_id` **and** the template's
 * `content_hash`, so republishing a template invalidates its renders without a
 * manual flush. Bounded, because a certificate set can grow.
 */

const MAX_ENTRIES = 200;
const cache = new Map<string, Buffer>();

export function cacheKey(credentialId: string, contentHash: string, format: "png" | "pdf"): string {
	return `${credentialId}:${contentHash}:${format}`;
}

export function read(key: string): Buffer | undefined {
	const hit = cache.get(key);
	if (!hit) return undefined;
	// Refresh insertion order so the map behaves as an LRU.
	cache.delete(key);
	cache.set(key, hit);
	return hit;
}

export function write(key: string, value: Buffer): Buffer {
	if (cache.size >= MAX_ENTRIES) {
		const oldest = cache.keys().next().value;
		if (oldest) cache.delete(oldest);
	}
	cache.set(key, value);
	return value;
}

/** Exported for tests. */
export const __testing = { cache, MAX_ENTRIES };
