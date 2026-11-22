/**
 * Response headers that apply to every document.
 *
 * Kept in a plain module rather than inline in `root.tsx` so the policy can be
 * unit-tested: a missing `Strict-Transport-Security` is invisible in a browser
 * and easy to drop in a refactor.
 *
 * HSTS is sent unconditionally. Over plain HTTP a browser must ignore it (RFC
 * 6797 §8.1), so sending it costs nothing in local development, and it removes
 * the failure mode this check exists for: a host that serves HTTPS but has
 * `DEPLOY_ENV` unset or misspelt would silently stop pinning TLS. `max-age` and
 * the absence of `includeSubDomains` match what the previous production app
 * sent, so the cutover does not change the pinning scope.
 */

export interface SecurityHeaderOptions {
	/** `DEPLOY_ENV`; anything other than `production` also gets a robots tag. */
	deployEnv?: string;
}

export function securityHeaders(options: SecurityHeaderOptions = {}): Record<string, string> {
	const deployEnv = options.deployEnv ?? process.env.DEPLOY_ENV;

	const headers: Record<string, string> = {
		"X-Content-Type-Options": "nosniff",
		"X-Frame-Options": "DENY",
		"Referrer-Policy": "strict-origin-when-cross-origin",
		"Permissions-Policy": "camera=(self), microphone=(), geolocation=(), payment=(), usb=()",
		"Strict-Transport-Security": "max-age=31536000",
	};

	// Staging and preview hosts stay out of search indexes. A production host
	// must never carry this tag.
	if (deployEnv !== "production") {
		headers["X-Robots-Tag"] = "noindex, nofollow";
	}

	return headers;
}
