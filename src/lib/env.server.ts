/**
 * Environment configuration for the SQLite-backed app.
 *
 * Reads from `process.env` and caches the result. `getEnv()` is called once at
 * boot so a missing or invalid variable fails the process there rather than
 * inside the first request.
 *
 * This module is additive: the PocketBase-era variables (`POCKETBASE_INTERNAL_URL`)
 * no longer exist: every surface is served by this app.
 */

/** Minimum length of `APP_SECRET`, in bytes. */
export const MIN_APP_SECRET_BYTES = 32;

export interface EnvConfig {
	/**
	 * Path to the SQLite database file, e.g. `./data/portal.db`.
	 *
	 * `:memory:` opens a private in-memory database, which is what the unit
	 * tests and the integration harness use.
	 */
	SQLITE_PATH: string;
	/** Root of the uploads volume. Files live here, never in the database. */
	UPLOADS_DIR: string;
	/**
	 * HMAC key for signing the OAuth `state` cookie. At least 32 bytes.
	 *
	 * Separate from the Google client secret on purpose: rotating the state key
	 * must not require re-issuing OAuth credentials.
	 */
	APP_SECRET: string;
	/** Google OAuth client id. Same client PocketBase uses; not secret. */
	GOOGLE_CLIENT_ID: string;
	/** Google OAuth client secret. Never logged, never committed. */
	GOOGLE_CLIENT_SECRET: string;
	/** Public base URL, used to build the OAuth redirect URI. */
	APP_URL: string;
	/** Session cookie name. `__Host-` requires Secure + Path=/ and no Domain. */
	SESSION_COOKIE_NAME: string;
	/** Days a session lives without activity. */
	SESSION_TTL_DAYS: number;
	/** Comma-separated allowed `Origin` values for mutating requests. */
	ALLOWED_ORIGINS?: string;
	/** `development` | `production` | `test`. */
	NODE_ENV: string;
	/** HTTP port. */
	PORT: number;
}

let envCache: EnvConfig | null = null;

function requireEnv(name: string): string {
	const value = process.env[name] ?? "";
	if (!value) throw new Error(`${name} is not set. Check your .env file.`);
	return value;
}

/**
 * Validate `APP_SECRET` at boot.
 *
 * A short secret makes the OAuth `state` signature guessable, which would let
 * an attacker forge a callback and log in as another user.
 */
function requireAppSecret(): string {
	const secret = requireEnv("APP_SECRET");
	const bytes = Buffer.byteLength(secret, "utf8");
	if (bytes < MIN_APP_SECRET_BYTES) {
		throw new Error(
			`APP_SECRET must be at least ${MIN_APP_SECRET_BYTES} bytes (got ${bytes}). ` +
				"Generate one with: openssl rand -base64 48",
		);
	}
	return secret;
}

export function getEnv(): EnvConfig {
	if (envCache) return envCache;

	const nodeEnv = process.env.NODE_ENV ?? "development";
	const isProduction = nodeEnv === "production";

	// Both are load-bearing in production: without APP_URL the OAuth redirect
	// URI points at the wrong host, and without ALLOWED_ORIGINS every
	// same-origin POST is rejected.
	if (isProduction) {
		requireEnv("APP_URL");
		requireEnv("ALLOWED_ORIGINS");
	}

	const rawPort = Number(process.env.PORT ?? 3000);
	const rawTtl = Number(process.env.SESSION_TTL_DAYS ?? 30);

	const config: EnvConfig = {
		SQLITE_PATH: process.env.SQLITE_PATH || "./data/portal.db",
		UPLOADS_DIR: process.env.UPLOADS_DIR || "./data/uploads",
		APP_SECRET: requireAppSecret(),
		GOOGLE_CLIENT_ID: requireEnv("GOOGLE_CLIENT_ID"),
		GOOGLE_CLIENT_SECRET: requireEnv("GOOGLE_CLIENT_SECRET"),
		APP_URL: (process.env.APP_URL || "http://localhost:5173").replace(/\/+$/, ""),
		SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME || "__Host-ieee_session",
		SESSION_TTL_DAYS: Number.isFinite(rawTtl) && rawTtl > 0 ? rawTtl : 30,
		ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
		NODE_ENV: nodeEnv,
		PORT: Number.isFinite(rawPort) ? rawPort : 3000,
	};

	envCache = config;
	return config;
}

/** Public base URL of the app (no trailing slash). */
export function getAppUrl(): string {
	return getEnv().APP_URL;
}

/** The exact redirect URI to register in the Google console. */
export function getGoogleRedirectUri(): string {
	return `${getAppUrl()}/auth/google/callback`;
}

/** Reset the cached config — used by tests to isolate `process.env` changes. */
export function resetEnvCache(): void {
	envCache = null;
}
