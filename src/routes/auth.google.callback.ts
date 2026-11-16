/**
 * `GET /auth/google/callback` — finish the sign-in flow.
 *
 * Verifies the signed `state`, exchanges the code server-side, upserts the user
 * by Google subject, and issues an opaque session cookie.
 *
 * Every failure path returns a clean redirect to `/?auth_error=...` rather than
 * a stack trace: this endpoint is reachable by anyone, and an error page here
 * would leak internals.
 */

import type { LoaderFunctionArgs } from "react-router";
import { users } from "@/lib/db.server";
import { completeSignIn, verifyState } from "@/server/auth/google.server";
import { oauthStateCookie, startSession } from "@/server/auth/session.server";

function failure(reason: string): Response {
	return new Response(null, {
		status: 302,
		headers: {
			Location: `/?auth_error=${encodeURIComponent(reason)}`,
			"Set-Cookie": "",
			"Cache-Control": "no-store",
		},
	});
}

export async function loader({ request }: LoaderFunctionArgs) {
	const url = new URL(request.url);

	// Google reports user-side failures (consent denied, etc.) on the callback.
	const oauthError = url.searchParams.get("error");
	if (oauthError) return failure(oauthError);

	const code = url.searchParams.get("code");
	const returnedState = url.searchParams.get("state");
	if (!code) return failure("missing_code");

	const signed = await oauthStateCookie().parse(request.headers.get("Cookie"));
	const state = verifyState(signed);
	if (!state) return failure("bad_state");

	// Constant-time-ish comparison is unnecessary here (the value is public and
	// single-use), but it must match exactly.
	if (!returnedState || returnedState !== state.state) return failure("state_mismatch");

	let identity;
	try {
		identity = await completeSignIn(code, state.codeVerifier);
	} catch (err) {
		// Log the message only — never the token payload or client secret.
		console.error("[auth] Google exchange failed:", err instanceof Error ? err.message : "unknown");
		return failure("exchange_failed");
	}

	const user = await users.upsertFromGoogle({
		googleSub: identity.sub,
		email: identity.email,
		emailVerified: identity.emailVerified,
		name: identity.name,
		avatar: identity.picture,
	});

	const { cookie } = await startSession(user.id, request);
	const clearState = await oauthStateCookie().serialize("", { maxAge: 0 });

	const headers = new Headers({
		Location: state.next || "/",
		"Cache-Control": "no-store",
	});
	headers.append("Set-Cookie", cookie);
	headers.append("Set-Cookie", clearState);

	return new Response(null, { status: 302, headers });
}
