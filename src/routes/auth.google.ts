/**
 * `GET /auth/google` — start the sign-in flow.
 *
 * Generates a `state` + PKCE verifier, stores them in a short-lived signed
 * cookie, and redirects to Google. Nothing secret leaves the server.
 */

import type { LoaderFunctionArgs } from "react-router";
import { buildAuthorizationUrl, newCodeVerifier, newState, signState } from "@/server/auth/google.server";
import { oauthStateCookie } from "@/server/auth/session.server";

/** Only allow same-origin relative paths as a post-login destination. */
function safeNext(raw: string | null): string {
	if (!raw) return "/";
	// Reject absolute URLs and protocol-relative paths — an open redirect here
	// would let a phishing link bounce through our domain.
	if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
	return raw;
}

export async function loader({ request }: LoaderFunctionArgs) {
	const url = new URL(request.url);
	const state = {
		state: newState(),
		codeVerifier: newCodeVerifier(),
		next: safeNext(url.searchParams.get("next")),
	};

	const cookie = await oauthStateCookie().serialize(signState(state));

	return new Response(null, {
		status: 302,
		headers: {
			Location: buildAuthorizationUrl(state),
			"Set-Cookie": cookie,
			"Cache-Control": "no-store",
		},
	});
}
