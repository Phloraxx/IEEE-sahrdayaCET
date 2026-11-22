/**
 * In-process TTL memo for the public, credential-free readers.
 *
 * Why a cache here at all
 * -----------------------
 * better-sqlite3 is synchronous, so every query on a public page render blocks
 * the event loop for its full duration. The public pages are the only ones with
 * real traffic, and their payloads change on the order of minutes — an event is
 * published, a society bio is edited. Re-reading them on every
 * request buys nothing and costs the whole process.
 *
 * Why it is safe
 * --------------
 * These readers are credential-free by construction: `src/server/public/*` only
 * ever reads rows that the schema already marks public (`status = 'published'`,
 * `is_hidden = 0`). There is no per-user input, so one visitor's cached result
 * is the correct result for every visitor.
 *
 * Staleness
 * ---------
 * 30 seconds, matching the `s-maxage` the edge cache uses for public documents
 * (see `@/server/http/cache`). An admin who publishes an event sees it on the
 * public site within half a minute, which is the same propagation delay the CDN
 * already imposes. The admin UI itself reads through `/api/*`, which is never
 * cached, so an editor always sees their own write immediately.
 *
 * Only bounded key spaces are cached. Slug lookups are deliberately excluded:
 * they are indexed single-row reads, and caching them would let the key space
 * grow with the number of published URLs.
 */

/** How long a public reader result stays fresh. */
export const PUBLIC_DATA_TTL_MS = 30_000;

interface Entry<T> {
	value: T;
	expiresAt: number;
}

/**
 * Wrap an async function in a TTL memo keyed on its arguments.
 *
 * Concurrent misses for the same key share one execution: without that, a burst
 * of traffic on a cold cache would run the same query N times, which on a
 * synchronous driver is N times the event-loop stall.
 *
 * Rejections are not cached — a transient failure must not be pinned for the
 * whole TTL.
 */
export function ttlMemo<TArgs extends unknown[], TResult>(
	fn: (...args: TArgs) => Promise<TResult>,
	ttlMs: number = PUBLIC_DATA_TTL_MS,
): (...args: TArgs) => Promise<TResult> {
	const entries = new Map<string, Entry<TResult>>();
	const inFlight = new Map<string, Promise<TResult>>();

	return async (...args: TArgs): Promise<TResult> => {
		const key = JSON.stringify(args);
		const now = Date.now();

		const hit = entries.get(key);
		if (hit && hit.expiresAt > now) return hit.value;

		const pending = inFlight.get(key);
		if (pending) return pending;

		const promise = fn(...args)
			.then((value) => {
				entries.set(key, { value, expiresAt: Date.now() + ttlMs });
				return value;
			})
			.finally(() => {
				inFlight.delete(key);
			});

		inFlight.set(key, promise);
		return promise;
	};
}
