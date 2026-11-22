/**
 * Cross-site request guard for state-changing requests.
 *
 * The session cookie is `SameSite=Lax`, which already blocks a cross-site POST
 * from carrying it. This is the second, independent control the cookie policy
 * claims: a mutating request that carries an `Origin` must name an origin this
 * deployment serves. If the header is absent the request is allowed — browsers
 * send `Origin` on every cross-origin request and on same-origin POSTs, while
 * server-to-server callers (the signed PayGate webhook, curl, health checks) do
 * not, and they authenticate by signature or by not carrying a cookie at all.
 *
 * Deliberately not a CSRF token: the browser client is a single-page app whose
 * mutations all go through `fetch`, so the origin check covers the whole surface
 * without threading a token through every form.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Development servers a browser may legitimately post from. */
const DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];

function normalizeOrigin(value: string | null | undefined): string {
	const raw = String(value ?? "").trim();
	if (!raw) return "";
	try {
		return new URL(raw).origin;
	} catch {
		return "";
	}
}

/** The configured origins, normalised, plus the current public origin. */
export function allowedOrigins(options: {
	allowedOrigins?: string | null;
	siteUrl?: string | null;
	appUrl?: string | null;
	nodeEnv?: string;
} = {}): Set<string> {
	const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV;
	const raw = [
		...(options.allowedOrigins ?? "").split(","),
		options.siteUrl ?? "",
		options.appUrl ?? "",
		...(nodeEnv === "production" ? [] : DEV_ORIGINS),
	];

	const origins = new Set<string>();
	for (const entry of raw) {
		const origin = normalizeOrigin(entry);
		if (origin) origins.add(origin);
	}
	return origins;
}

/**
 * May this request proceed?
 *
 * `requestOrigin` is the deployment's own origin, used to accept same-origin
 * requests without requiring `ALLOWED_ORIGINS` to list it twice.
 */
export function isMutationOriginAllowed(
	request: Request,
	options: {
		allowedOrigins?: string | null;
		siteUrl?: string | null;
		appUrl?: string | null;
		requestOrigin?: string;
		nodeEnv?: string;
	} = {},
): boolean {
	const method = request.method.toUpperCase();
	if (SAFE_METHODS.has(method)) return true;

	const origin = request.headers.get("Origin");
	// No Origin: not a browser navigation, so the cookie cannot be attached by a
	// third-party page. The session cookie is still required by every route.
	if (origin === null) return true;

	const normalized = normalizeOrigin(origin);
	// `Origin: null` is what a sandboxed iframe or a `data:` document sends. It
	// can never be a legitimate same-origin caller.
	if (!normalized) return false;

	const allowed = allowedOrigins(options);
	if (options.requestOrigin && normalized === normalizeOrigin(options.requestOrigin)) {
		return true;
	}
	return allowed.has(normalized);
}
