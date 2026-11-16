/**
 * Session handling — opaque tokens in a `__Host-` cookie.
 *
 * Why not a JWT
 * -------------
 * PocketBase issued a JWT that the browser stored and sent as `Authorization`.
 * That cannot survive the mediated port: the token must not be readable by
 * JavaScript, and it must be revocable. An opaque random token in an HttpOnly
 * cookie, with only its sha256 in the database, gives both — logout is a DELETE,
 * and a database leak does not hand out live sessions.
 *
 * Cookie attributes
 * -----------------
 * `__Host-` requires `Secure`, `Path=/`, and no `Domain`. That makes the cookie
 * impossible to set from a subdomain and impossible to overwrite cross-origin.
 * `SameSite=Lax` (not `Strict`) is deliberate: the OAuth callback is a
 * cross-site top-level GET navigation, and `Strict` would drop the cookie on
 * return from Google. `Lax` still blocks cross-site POSTs, and every mutating
 * route additionally checks `Origin`.
 */

import { createHash, randomBytes } from "node:crypto";
import { createCookie } from "react-router";
import { getEnv } from "@/lib/env.server";
import { nowIso, sessions, type SessionRow, type UserRow } from "@/lib/db.server";

/** How stale `last_seen_at` may get before we write it again. */
const TOUCH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

function sessionCookie() {
	const env = getEnv();
	return createCookie(env.SESSION_COOKIE_NAME, {
		path: "/",
		httpOnly: true,
		secure: true,
		sameSite: "lax",
		maxAge: env.SESSION_TTL_DAYS * 24 * 60 * 60,
	});
}

/**
 * Short-lived cookie carrying the signed OAuth `state` + PKCE verifier.
 *
 * Deliberately separate from the session cookie: it exists for ~10 minutes and
 * is cleared on the callback. `SameSite=Lax` because the callback is a
 * top-level cross-site GET from Google.
 */
export function oauthStateCookie() {
	return createCookie("__Host-ieee_oauth", {
		path: "/",
		httpOnly: true,
		secure: true,
		sameSite: "lax",
		maxAge: 10 * 60,
	});
}

/** sha256 of the token, hex. Only this is stored. */
export function hashToken(token: string): string {
	return createHash("sha256").update(token).digest("hex");
}

/** A fresh opaque token (32 random bytes, base64url). */
export function newSessionToken(): string {
	return randomBytes(32).toString("base64url");
}

export interface SessionContext {
	session: SessionRow;
	user: UserRow;
}

/**
 * Resolve the session for a request, or null.
 *
 * Slides the expiry when the session has not been touched recently, so an
 * active user never gets logged out mid-session while an idle one eventually
 * expires.
 */
export async function getSessionUser(request: Request): Promise<SessionContext | null> {
	const token = await sessionCookie().parse(request.headers.get("Cookie"));
	if (!token || typeof token !== "string") return null;

	const found = await sessions.findLiveByTokenHash(hashToken(token));
	if (!found) return null;

	const env = getEnv();
	const lastSeen = Date.parse(found.session.last_seen_at);
	if (!Number.isFinite(lastSeen) || Date.now() - lastSeen > TOUCH_INTERVAL_MS) {
		await sessions.touch(found.session.id, env.SESSION_TTL_DAYS);
	}

	return found;
}

/** Like `getSessionUser`, but throws a redirect to sign-in when absent. */
export async function requireUser(request: Request): Promise<SessionContext> {
	const context = await getSessionUser(request);
	if (context) return context;

	const url = new URL(request.url);
	const next = `${url.pathname}${url.search}`;
	throw new Response(null, {
		status: 302,
		headers: { Location: `/auth/google?next=${encodeURIComponent(next)}` },
	});
}

/** Create a session row and return the `Set-Cookie` header value. */
export async function startSession(
	userId: string,
	request: Request,
): Promise<{ cookie: string; session: SessionRow }> {
	const env = getEnv();
	const token = newSessionToken();

	const session = await sessions.create({
		userId,
		token,
		tokenHash: hashToken(token),
		ttlDays: env.SESSION_TTL_DAYS,
		userAgent: request.headers.get("User-Agent"),
		ipHash: hashClientIp(request),
	});

	const cookie = await sessionCookie().serialize(token);
	return { cookie, session };
}

/** Revoke the current session and return the cookie-clearing header value. */
export async function endSession(request: Request): Promise<string> {
	const token = await sessionCookie().parse(request.headers.get("Cookie"));
	if (token && typeof token === "string") {
		const found = await sessions.findLiveByTokenHash(hashToken(token));
		if (found) await sessions.delete(found.session.id);
	}
	return sessionCookie().serialize("", { maxAge: 0 });
}

/**
 * A stable, non-reversible client identifier for session metadata.
 *
 * We store a hash rather than the address so the sessions table cannot be used
 * to reconstruct who was where.
 */
function hashClientIp(request: Request): string | null {
	const forwarded = request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Forwarded-For");
	const ip = forwarded?.split(",")[0]?.trim();
	if (!ip) return null;
	return hashToken(`ip:${ip}`);
}

/** Housekeeping hook — call from a scheduled job, not per request. */
export async function pruneExpiredSessions(): Promise<number> {
	return sessions.deleteExpired();
}

/** Exported for tests. */
export const __testing = { sessionCookie, TOUCH_INTERVAL_MS, nowIso };
