import { APP_URL } from '@/lib/constants'
/**
 * CSRF defense: verifies the request's Origin header matches the application URL.
 * Uses URL.origin for exact comparison (not substring match).
 * Call at the top of every mutation (POST/PUT/PATCH/DELETE) handler.
 */
export function verifySameOrigin(request: Request): void {
	const origin = request.headers.get("origin");
	const appUrl = APP_URL;
	const isDev = process.env.NODE_ENV !== 'production';

	// In production the origin check is mandatory. In dev, allow missing config or
	// missing Origin header for local testing, but never allow a mismatched origin.
	if (!appUrl) {
		if (!isDev) {
			throw new Error('PUBLIC_APP_URL is not configured');
		}
		return;
	}

	if (!origin) {
		if (!isDev) {
			throw new Error('Missing Origin header');
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

		throw new Error(`Invalid origin: ${origin}`);
	} catch (e) {
		if (e instanceof Error && e.message.startsWith('Invalid origin')) {
			throw e;
		}
		if (!isDev) {
			throw new Error(`Invalid origin: ${origin}`);
		}
	}
}
