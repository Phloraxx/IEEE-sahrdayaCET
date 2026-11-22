/**
 * Cache policy for anonymous public HTML.
 *
 * The public site is server-rendered, and — by design — the document carries no
 * user state. Authentication lives in `AuthProvider`, which asks `/api/session`
 * *after* hydration, so the HTML a signed-out visitor receives is identical for
 * every visitor. That is what makes it safe for a shared cache to hold it.
 *
 * Two guards keep that true as the app grows:
 *
 *   1. **Path allow-list.** Only the routes listed below are cacheable. A new
 *      route is not cached until it is added deliberately, so the failure mode
 *      is "no edge cache", never "one user's page served to another".
 *   2. **Session cookie.** A request that carries the session cookie is never
 *      given a shared-cache directive, so a signed-in browser cannot be handed
 *      a cached document.
 *
 * Deliberately absent from the list, and why:
 *
 *   - `/my-events`, `/register/*`, `/payment/*`, `/ticket/*`, `/c/*` — the
 *     loader output is per-user or token-scoped.
 *   - `/verify` — token-scoped, and there is no repeat-visit benefit.
 *   - `/admin/*`, `/api/*`, `/files/*`, `/auth/*` — not documents, or not public.
 *   - `/events/:slug/calendar.ics` — an ICS resource with its own cache header.
 *   - `/robots.txt`, `/sitemap.xml` — their own cache headers.
 *
 * The 60 second `s-maxage` is a deliberate trade: an admin who publishes an
 * event sees it on the public site within a minute, and a shared cache absorbs
 * the traffic spike that follows a mail-out. `stale-while-revalidate` keeps a
 * visitor from ever waiting on the revalidation.
 */

/**
 * Shared-cache directives for an anonymous public document.
 *
 * No `max-age`: the document is for a shared cache, and a browser must not hold
 * it. Cloudflare's edge TTL reads `s-maxage`, so adding `max-age=0` here would
 * make every edge entry expire immediately; the browser TTL is controlled by the
 * Cache Rule instead (see docs/deployment.md).
 */
export const PUBLIC_DOCUMENT_CACHE_CONTROL =
	"public, s-maxage=60, stale-while-revalidate=300";

/**
 * Every cacheable public page, as a matcher on `URL.pathname`.
 *
 * Anchored on both ends: a prefix match would let `/events/foo/anything` through
 * if a nested route is added later.
 */
const PUBLIC_PAGE_PATTERNS: readonly RegExp[] = [
	/^\/$/,
	/^\/about$/,
	/^\/contact$/,
	/^\/pricing$/,
	/^\/events$/,
	/^\/events\/[^/]+$/,
	/^\/blog$/,
	/^\/blog\/[^/]+$/,
	/^\/societies$/,
	/^\/societies\/[^/]+$/,
	/^\/full-execom$/,
	/^\/infinia$/,
	/^\/infinia\/[^/]+$/,
	/^\/flagships$/,
	/^\/flagships\/[^/]+$/,
	/^\/flagships\/[^/]+\/[^/]+$/,
	/^\/shipping-and-delivery-policy$/,
	/^\/terms-and-conditions$/,
	/^\/privacy-policy$/,
	/^\/refund-and-cancellation-policy$/,
];

/** True when the request carries the application session cookie. */
function hasSessionCookie(request: Request, cookieName: string): boolean {
	const header = request.headers.get("Cookie");
	if (!header) return false;
	// Cheap containment check: the cookie name is a fixed, non-regex string.
	return header.includes(`${cookieName}=`);
}

/**
 * Whether this request may be answered with a shared-cacheable document.
 *
 * `sessionCookieName` is passed in rather than read from the environment so the
 * predicate stays pure and testable.
 */
export function isCacheablePublicDocument(
	request: Request,
	sessionCookieName: string,
): boolean {
	if (request.method !== "GET" && request.method !== "HEAD") return false;

	const { pathname } = new URL(request.url);

	// React Router `.data` requests back client-side navigations. They are
	// per-navigation payloads, not documents, and must not be shared.
	if (pathname.endsWith(".data")) return false;

	if (hasSessionCookie(request, sessionCookieName)) return false;

	return PUBLIC_PAGE_PATTERNS.some((pattern) => pattern.test(pathname));
}
