/**
 * Helpers shared by the release-gate Playwright specs.
 *
 * The release gate runs against a **compiled** app (`bun run build` then
 * `bun run start`) on loopback, seeded with a synthetic database by
 * `tests/ci/seed.mjs`. Two things every authenticated spec needs come from
 * here:
 *
 * 1. **A session cookie in the browser's own encoding.** The app parses its
 *    cookie with `createCookie(...).parse()`, which JSON-decodes and base64s
 *    the value. Hand-writing `__Host-ieee_session=<token>` is silently dropped
 *    (React Router answers `null`), so the value is always produced by the same
 *    `createCookie(...).serialize(token)` the app uses.
 * 2. **A session minted the way the app mints one.** Only the sha256 of the
 *    token is stored, so the plaintext token never has to be persisted.
 *
 * Everything here is opt-in: without `RELEASE_GATE=1` (set by
 * `tests/ci/release-gate.mjs` and the CI job) the specs fail with an
 * actionable message instead of passing by doing nothing.
 */

import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { createCookie } from "react-router";
import Database from "better-sqlite3";

/** The gate is only meaningful against the synthetic release-gate database. */
export function requireReleaseGate(): void {
	const missing: string[] = [];
	if (process.env.RELEASE_GATE !== "1") missing.push("RELEASE_GATE=1");
	if (!process.env.RELEASE_GATE_SQLITE_PATH) missing.push("RELEASE_GATE_SQLITE_PATH");
	if (!process.env.RELEASE_GATE_APP_URL) missing.push("RELEASE_GATE_APP_URL");
	if (missing.length) {
		throw new Error(
			`The release gate needs ${missing.join(", ")}. ` +
				"Run it with `bun run test:release-gate`, or in CI via the `release-gate` job. " +
				"A skip here would hide a broken gate, so it fails instead.",
		);
	}
}

export function releaseGateDbPath(): string {
	requireReleaseGate();
	const path = process.env.RELEASE_GATE_SQLITE_PATH as string;
	if (!existsSync(path)) {
		throw new Error(`release-gate database does not exist: ${path} (run tests/ci/seed.mjs first)`);
	}
	return path;
}

export const SESSION_COOKIE_NAME = "__Host-ieee_session";
const SESSION_TTL_DAYS = 30;

/** The value the browser must send for `token`: what the app's own serializer writes. */
export async function encodedSessionValue(token: string): Promise<string> {
	const cookie = createCookie(SESSION_COOKIE_NAME, {
		path: "/",
		httpOnly: true,
		secure: true,
		sameSite: "lax",
		maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
	});
	const serialized = await cookie.serialize(token);
	// `serialize` returns `name=value; attributes…`; the browser sends the value.
	const pair = serialized.split(";")[0] ?? `${SESSION_COOKIE_NAME}=`;
	return pair.slice(SESSION_COOKIE_NAME.length + 1);
}

export interface MintedSession {
	/** Plaintext token. Only ever held in memory. */
	token: string;
	/** Value for a `Cookie:` header and for `context.addCookies`. */
	cookieValue: string;
	sessionId: string;
	userId: string;
}

/**
 * Insert a live session row for `email` and return the browser cookie value.
 *
 * Fails when the seed is missing, so a typo in the seed id cannot turn an
 * authenticated spec into an anonymous one that happens to pass.
 */
export async function mintSession(email: string): Promise<MintedSession> {
	const db = new Database(releaseGateDbPath(), { timeout: 10_000 });
	try {
		const user = db.prepare("SELECT id, email, role FROM users WHERE email = ?").get(email) as
			| { id: string; email: string; role: string }
			| undefined;
		if (!user) throw new Error(`release-gate seed has no user ${email} (run tests/ci/seed.mjs)`);

		const token = randomBytes(32).toString("base64url");
		const now = new Date();
		const sessionId = randomBytes(16).toString("hex");
		db.prepare(
			`INSERT INTO sessions (id, token_hash, user_id, created_at, expires_at, last_seen_at, user_agent, ip_hash)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			sessionId,
			createHash("sha256").update(token).digest("hex"),
			user.id,
			now.toISOString(),
			new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
			now.toISOString(),
			"release-gate",
			null,
		);

		return { token, cookieValue: await encodedSessionValue(token), sessionId, userId: user.id };
	} finally {
		db.close();
	}
}

/** A `Cookie` request header for `minted`. */
export function cookieHeader(minted: MintedSession): string {
	return `${SESSION_COOKIE_NAME}=${minted.cookieValue}`;
}

/** True when the session row still exists (logout must have deleted it). */
export function sessionExists(sessionId: string): boolean {
	const db = new Database(releaseGateDbPath(), { timeout: 10_000, readonly: true });
	try {
		return Boolean(db.prepare("SELECT 1 FROM sessions WHERE id = ?").get(sessionId));
	} finally {
		db.close();
	}
}
