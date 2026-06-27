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
	const appUrl = APP_URL;
	const isDev = process.env.NODE_ENV !== 'production';

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

		// In dev mode, allow any localhost/127.0.0.1 origin — Vite often
		// picks a different port than PUBLIC_APP_URL, and the port mismatch
		// shouldn't block local mutations.
		if (isDev) {
			const reqHost = new URL(origin).hostname;
			if (reqHost === 'localhost' || reqHost === '127.0.0.1') return;
		}

		throw new AuthError('Invalid origin', 403);
	} catch (e) {
		if (e instanceof AuthError) throw e;
		// A present-but-unparseable Origin (or appUrl) is never a legitimate
		// same-origin request — reject it regardless of environment.
		throw new AuthError('Invalid origin', 403);
	}
}
