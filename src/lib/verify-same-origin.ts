import { AuthError } from '@/lib/auth'
import { APP_URL } from '@/lib/constants'
/**
 * CSRF defense: verifies the request's Origin header matches the application URL.
 * Uses URL.origin for exact comparison (not substring match).
 * Call at the top of every mutation (POST/PUT/PATCH/DELETE) handler.
 *
 * Throws AuthError(…, 403) on any rejection so handleError maps it to HTTP 403
 * (a plain Error would fall through to 500).
 */
export function verifySameOrigin(request: Request): void {
	const origin = request.headers.get("origin");
	const host = request.headers.get("host");
	const appUrl = APP_URL;
	const isDev = process.env.NODE_ENV !== 'production';
	// Log a warning when CSRF is bypassed so misconfiguration doesn't go unnoticed.
	if (isDev && (!appUrl || !origin)) {
		console.warn(`[csrf] CSRF check bypassed: APP_URL=${appUrl ? 'set' : 'MISSING'} Origin=${origin ? 'set' : 'MISSING'} NODE_ENV=${process.env.NODE_ENV}`);
	}

	// In production the origin check is mandatory. In dev, allow missing config or
	// missing Origin header for local testing, but never allow a mismatched or
	// malformed origin.
	if (!appUrl) {
		if (!isDev) {
			throw new AuthError('Server misconfigured: PUBLIC_APP_URL is not set', 500);
		}
		return;
	}

	if (!origin) {
		if (!isDev) {
			throw new AuthError('Missing Origin header', 403);
		}
		return;
	}

	try {
		const appOrigin = new URL(appUrl).origin;
		const requestOrigin = new URL(origin).origin;

		if (appOrigin === requestOrigin) return;

		const appHost = new URL(appUrl).hostname;
		const reqHost = new URL(origin).hostname;

		// Allow preview subdomains (e.g. preview-ieee-website-xxx.ieeesahrdaya.com)
		// when the app URL is a *.ieeesahrdaya.com domain. Dokploy generates
		// unique preview subdomains per PR; the origin check would otherwise
		// block all mutations on preview builds.
		const apexDomain = appHost.split('.').slice(-2).join('.');
		if (
			apexDomain.length > 0 &&
			reqHost.endsWith(`.${  apexDomain}`) &&
			(reqHost === appHost || reqHost.startsWith('preview-'))
		) return;

		// Fallback: if PUBLIC_APP_URL is misconfigured (e.g. localhost in preview),
		// check the Host header against the Origin. A matching Host + Origin pair
		// is a valid same-origin request regardless of PUBLIC_APP_URL.
		if (host) {
			const hostOrigin = new URL(`https://${host}`).origin;
			if (hostOrigin === requestOrigin) return;
		}

		// In dev mode, allow any localhost/127.0.0.1 origin — Vite often
		// picks a different port than PUBLIC_APP_URL, and the port mismatch
		// shouldn't block local mutations.
		if (isDev) {
			if (reqHost === 'localhost' || reqHost === '127.0.0.1') return;
		}

		throw new AuthError('Invalid origin', 403);
	} catch (e) {
		if (e instanceof AuthError) throw e;
		throw new AuthError('Invalid origin', 403);
	}
}
