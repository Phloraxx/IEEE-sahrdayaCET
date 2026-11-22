/**
 * Google OAuth 2.0 — authorization-code flow with PKCE, exchange server-side.
 *
 * Why this replaces the browser flow
 * ----------------------------------
 * PocketBase's `authWithOAuth2()` runs the whole exchange in the browser: the
 * popup talks to Google, PocketBase receives the code, and the browser ends up
 * holding a PocketBase JWT. A mediated design cannot keep that — the client
 * secret would have to be public, and the browser would hold a database-adjacent
 * token.
 *
 * Here the browser only ever sees a redirect and, on return, an opaque session
 * cookie. The code exchange, the client secret and the Google access token all
 * stay on the server.
 *
 * Reusing the existing OAuth client
 * ---------------------------------
 * Per the phase-0 decision, this uses the *same* Google client id PocketBase
 * uses. That means the Google console must list **both** redirect URIs:
 *
 *   https://<staging-host>/api/oauth2-redirect        (PocketBase — keep until cutover)
 *   https://<staging-host>/auth/google/callback       (this app — add)
 *
 * `getGoogleRedirectUri()` in `env.server.ts` produces the second one, so the
 * value to paste into the console is never hand-assembled.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getEnv, getGoogleRedirectUri } from "@/lib/env.server";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

/** Scopes: `openid` for the `sub` claim, plus profile and email. */
const SCOPES = ["openid", "email", "profile"];

export interface GoogleIdentity {
	sub: string;
	email: string;
	emailVerified: boolean;
	name: string | null;
	picture: string | null;
}

export interface OAuthState {
	state: string;
	codeVerifier: string;
	/** Where to send the user after a successful callback. */
	next: string;
}

/** base64url without padding — the encoding PKCE requires. */
function base64url(bytes: Buffer): string {
	return bytes.toString("base64url");
}

/** A PKCE `code_verifier` (43–128 chars of unreserved characters). */
export function newCodeVerifier(): string {
	return base64url(randomBytes(32));
}

/** `code_challenge` = base64url(sha256(verifier)), S256 method. */
export function codeChallengeFor(verifier: string): string {
	return createHash("sha256").update(verifier).digest("base64url");
}

/** A random `state` value. */
export function newState(): string {
	return base64url(randomBytes(24));
}

/**
 * Sign the state payload so the callback can trust it.
 *
 * The state cookie is HttpOnly and short-lived, but signing it as well means a
 * forged cookie cannot be used to fix the `state` value (CSRF on the callback).
 */
export function signState(payload: OAuthState): string {
	const env = getEnv();
	const body = base64url(Buffer.from(JSON.stringify(payload), "utf8"));
	const mac = createHmac("sha256", env.APP_SECRET).update(body).digest("base64url");
	return `${body}.${mac}`;
}

/** Verify and decode a signed state payload. Returns null when invalid. */
export function verifyState(signed: string | null | undefined): OAuthState | null {
	if (!signed) return null;
	const env = getEnv();
	const [body, mac] = signed.split(".");
	if (!body || !mac) return null;

	const expected = createHmac("sha256", env.APP_SECRET).update(body).digest("base64url");
	const a = Buffer.from(mac);
	const b = Buffer.from(expected);
	if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

	try {
		const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthState;
		if (!parsed?.state || !parsed?.codeVerifier) return null;
		return { state: parsed.state, codeVerifier: parsed.codeVerifier, next: parsed.next || "/" };
	} catch {
		return null;
	}
}

/** Build the URL to send the browser to. */
export function buildAuthorizationUrl(state: OAuthState): string {
	const env = getEnv();
	const params = new URLSearchParams({
		client_id: env.GOOGLE_CLIENT_ID,
		redirect_uri: getGoogleRedirectUri(),
		response_type: "code",
		scope: SCOPES.join(" "),
		state: state.state,
		code_challenge: codeChallengeFor(state.codeVerifier),
		code_challenge_method: "S256",
		// `select_account` lets a user pick a different Google account than the
		// one already signed in — important on shared lab machines.
		prompt: "select_account",
		access_type: "online",
	});
	return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * Exchange an authorization code for tokens, server-side.
 *
 * Throws on any non-2xx so the caller can turn it into a clean error page
 * rather than a half-authenticated session.
 */
export async function exchangeCode(
	code: string,
	codeVerifier: string,
	fetchImpl: typeof fetch = fetch,
): Promise<{ accessToken: string; idToken: string | null }> {
	const env = getEnv();
	const body = new URLSearchParams({
		code,
		client_id: env.GOOGLE_CLIENT_ID,
		client_secret: env.GOOGLE_CLIENT_SECRET,
		redirect_uri: getGoogleRedirectUri(),
		grant_type: "authorization_code",
		code_verifier: codeVerifier,
	});

	const response = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body,
	});

	if (!response.ok) {
		// Never log the body: it can echo back the client secret on some errors.
		throw new Error(`Google token exchange failed: HTTP ${response.status}`);
	}

	const json = (await response.json()) as {
		access_token?: string;
		id_token?: string;
	};

	if (!json.access_token) throw new Error("Google token exchange returned no access_token");
	return { accessToken: json.access_token, idToken: json.id_token ?? null };
}

/** Fetch the OpenID userinfo document. */
export async function fetchIdentity(
	accessToken: string,
	fetchImpl: typeof fetch = fetch,
): Promise<GoogleIdentity> {
	const response = await fetchImpl(GOOGLE_USERINFO_ENDPOINT, {
		headers: { Authorization: `Bearer ${accessToken}` },
	});
	if (!response.ok) throw new Error(`Google userinfo failed: HTTP ${response.status}`);

	const json = (await response.json()) as {
		sub?: string;
		email?: string;
		email_verified?: boolean | string;
		name?: string;
		picture?: string;
	};

	if (!json.sub || !json.email) {
		throw new Error("Google userinfo did not include sub and email");
	}

	return {
		sub: json.sub,
		email: json.email,
		// Google returns a boolean for this endpoint; some responses use "true".
		emailVerified: json.email_verified === true || json.email_verified === "true",
		name: json.name ?? null,
		picture: json.picture ?? null,
	};
}

/**
 * The complete exchange, in one call.
 *
 * Split out so the route stays thin and so tests can inject a fake `fetch`.
 */
export async function completeSignIn(
	code: string,
	codeVerifier: string,
	fetchImpl: typeof fetch = fetch,
): Promise<GoogleIdentity> {
	const { accessToken } = await exchangeCode(code, codeVerifier, fetchImpl);
	return fetchIdentity(accessToken, fetchImpl);
}

