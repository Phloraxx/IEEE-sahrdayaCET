import { APP_URL } from '@/lib/constants'
/**
 * CSRF defense: verifies the request's Origin header matches the application URL.
 * Uses URL.origin for exact comparison (not substring match).
 * Call at the top of every mutation (POST/PUT/PATCH/DELETE) handler.
 */
export function verifySameOrigin(request: Request): void {
	const origin = request.headers.get("origin");
	const appUrl = APP_URL;

	// In production the origin check is mandatory. In dev, allow missing config or
	// missing Origin header for local testing, but never allow a mismatched origin.
	if (!appUrl) {
		if (process.env.NODE_ENV === 'production') {
			throw new Error('PUBLIC_APP_URL is not configured');
		}
		return;
	}

	if (!origin) {
		if (process.env.NODE_ENV === 'production') {
			throw new Error('Missing Origin header');
		}
		return;
	}

	try {
		const appOrigin = new URL(appUrl).origin;
		const requestOrigin = new URL(origin).origin;
		if (appOrigin !== requestOrigin) {
			throw new Error(`Invalid origin: ${origin}`);
		}
	} catch (e) {
		if (e instanceof Error && e.message.startsWith('Invalid origin')) {
			throw e;
		}
		if (process.env.NODE_ENV === 'production') {
			throw new Error(`Invalid origin: ${origin}`);
		}
	}
}
