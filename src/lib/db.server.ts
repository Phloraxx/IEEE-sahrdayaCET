/**
 * SQLite access layer — one process-wide better-sqlite3 connection.
 *
 * Follows the VisionHack portal's proven discipline (see
 * /home/drvij/pg-migration/VisionHack_Submission-Portal/app/lib/db.server.ts).
 *
 * Why one connection
 * ------------------
 * better-sqlite3 is synchronous, so the event loop *is* the write queue: a
 * statement runs to completion before any other request can start one. That is
 * what makes a single connection faster than a pool — a pool would serialise on
 * SQLite's writer lock and produce `SQLITE_BUSY` tails.
 *
 * Conventions
 * -----------
 * - Columns are snake_case (see `sqlite/schema.sql`); this module exposes
 *   snake_case rows and lets callers map to their own shapes.
 * - Every query is parameterised. No string interpolation of user input.
 * - Timestamps are TEXT ISO-8601 UTC with milliseconds. `strftime('%Y-%m-%dT%H:%M:%fZ')`
 *   in the schema and `new Date().toISOString()` here produce the same shape,
 *   so lexical comparison is chronological.
 * - Booleans are INTEGER 0/1; `bindable` coerces on the way in, and callers
 *   compare `=== 1` on the way out.
 *
 * better-sqlite3 traps this module exists to absorb
 * -------------------------------------------------
 * 1. Named parameters are rejected when binding an array — everything here uses
 *    positional `?` and callers must pass values in placeholder order.
 * 2. Booleans cannot be bound at all; `bindable()` converts them to 1/0.
 * 3. `ON DELETE RESTRICT` is implemented as an internal trigger, so a blocked
 *    delete raises `SQLITE_CONSTRAINT_TRIGGER`, not `..._FOREIGNKEY`. Both are
 *    treated as a foreign-key violation by `isForeignKeyViolation()`.
 * 4. `RETURNING` rejects a table alias (`RETURNING s.id`); the schema and every
 *    statement here use bare column names.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import { getEnv } from "./env.server";

/**
 * Schema version this build expects. 1 is the initial release.
 *
 * Bumping this re-applies `sqlite/schema.sql`, which is idempotent — but the
 * file only creates missing objects. Changing an existing column (a type, a
 * NOT NULL) still needs a real migration; a bump alone will not alter it.
 */
const SCHEMA_VERSION = 1;

/** `:memory:` opens a private in-memory database — used by tests. */
const IN_MEMORY = ":memory:";

// ---------------------------------------------------------------------------
// Connection singleton (HMR-safe)
// ---------------------------------------------------------------------------

interface DbGlobal {
	__ieeeSqlite?: Database.Database;
}

const globalForDb = globalThis as typeof globalThis & DbGlobal;

/**
 * Apply `sqlite/schema.sql` when the database is older than this build.
 *
 * The file is idempotent, so re-applying it to a database created by an older
 * build is safe. `PRAGMA user_version` is the marker: 0 means "never
 * initialised" (a fresh file, or one from before the port).
 */
function ensureSchema(database: Database.Database): void {
	const version = database.pragma("user_version", { simple: true }) as number;
	if (version >= SCHEMA_VERSION) return;

	const schemaFile = resolve(process.cwd(), "sqlite", "schema.sql");
	const schema = readFileSync(schemaFile, "utf8");

	database.exec("BEGIN IMMEDIATE");
	try {
		database.exec(schema);
		database.pragma(`user_version = ${SCHEMA_VERSION}`);
		database.exec("COMMIT");
	} catch (err) {
		database.exec("ROLLBACK");
		throw err;
	}
}

function openDatabase(): Database.Database {
	const path = getEnv().SQLITE_PATH;
	if (path !== IN_MEMORY) mkdirSync(dirname(resolve(path)), { recursive: true });

	const database = new Database(path);
	// WAL keeps readers off the writer's back and survives a crash; NORMAL syncs
	// at checkpoint rather than per commit (the documented trade: the last few
	// transactions can be lost on power loss, the database cannot corrupt).
	database.pragma("journal_mode = WAL");
	database.pragma("synchronous = NORMAL");
	// Off by default in SQLite — without it every FK in the schema is decorative.
	database.pragma("foreign_keys = ON");
	database.pragma("busy_timeout = 5000");
	database.pragma("wal_autocheckpoint = 1000");

	ensureSchema(database);
	return database;
}

/** The shared connection. Opened on first use, never closed by the app. */
function getDatabase(): Database.Database {
	if (!globalForDb.__ieeeSqlite) {
		globalForDb.__ieeeSqlite = openDatabase();
	}
	return globalForDb.__ieeeSqlite;
}

/** Close and forget the connection. Tests only — the app never calls this. */
export function closeDatabase(): void {
	if (globalForDb.__ieeeSqlite) {
		globalForDb.__ieeeSqlite.close();
		globalForDb.__ieeeSqlite = undefined;
	}
	statementCache.clear();
}

// ---------------------------------------------------------------------------
// Statement cache + binding
// ---------------------------------------------------------------------------

/**
 * Prepared statements, keyed by SQL text.
 *
 * The set of distinct statements is fixed by the code paths below, so the map
 * is naturally bounded. Re-preparing per call would re-parse and re-plan on
 * every request — the single largest avoidable cost in a synchronous driver.
 */
const statementCache = new Map<string, Database.Statement>();

function prepare(sql: string): Database.Statement {
	let statement = statementCache.get(sql);
	if (!statement) {
		statement = getDatabase().prepare(sql);
		statementCache.set(sql, statement);
	}
	return statement;
}

/** What better-sqlite3 accepts as a bound value. */
type BindValue = string | number | bigint | Buffer | null;

/**
 * Coerce a JavaScript value to something SQLite can bind.
 *
 * SQLite has no boolean type and better-sqlite3 rejects `true`/`false`
 * outright, so they become 1/0 here rather than at every call site. `undefined`
 * binds as NULL, matching how an absent optional column behaved in PocketBase.
 */
function bindable(value: unknown): BindValue {
	if (value === null || value === undefined) return null;
	if (typeof value === "boolean") return value ? 1 : 0;
	if (value instanceof Date) return value.toISOString();
	if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
		return value;
	}
	if (Buffer.isBuffer(value)) return value;
	throw new TypeError(`Unsupported SQLite bind value of type ${typeof value}`);
}

function bindAll(params: unknown[]): BindValue[] {
	return params.map(bindable);
}

/**
 * Run a statement and return every row it produced.
 *
 * A statement that returns no rows (a plain INSERT/UPDATE/DELETE) is executed
 * with `run()` and reported as an empty result.
 */
function selectAll<T>(sql: string, params: unknown[] = []): T[] {
	const statement = prepare(sql);
	const values = bindAll(params);
	if (!statement.reader) {
		statement.run(...values);
		return [];
	}
	return statement.all(...values) as T[];
}

/** Run a statement and return its first row, if any. */
function selectOne<T>(sql: string, params: unknown[] = []): T | undefined {
	return prepare(sql).get(...bindAll(params)) as T | undefined;
}

/** Run a write and return the number of affected rows. */
function execute(sql: string, params: unknown[] = []): number {
	return prepare(sql).run(...bindAll(params)).changes;
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/** The `rows` shape `query()` returns. */
export interface QueryResult<T> {
	rows: T[];
}

/**
 * Marks the async call chain that is running inside `withTransaction`.
 *
 * `query()` only *reads* it, to decide whether to join the open transaction or
 * wait for it to finish.
 */
const transactionStorage = new AsyncLocalStorage<true>();

/**
 * Tail of the queue that serialises access to the single connection.
 *
 * A transaction holds this for its whole duration, including any await inside
 * its body. That matters: better-sqlite3 is synchronous, but a transaction body
 * may still await non-database I/O (the Google token exchange, an SMTP send).
 * Without the lock, another request's statements would execute inside that open
 * transaction and be committed or rolled back with it.
 */
let lockTail: Promise<void> = Promise.resolve();

async function acquireConnection(): Promise<() => void> {
	let release!: () => void;
	const held = new Promise<void>((resolveHeld) => {
		release = resolveHeld;
	});
	const previous = lockTail;
	lockTail = previous.then(() => held);
	await previous;
	return release;
}

/**
 * Run a parameterised query.
 *
 * Inside `withTransaction` the query runs on the open transaction, so a
 * repository call made from the callback is part of the same atomic unit.
 * Outside one it waits for any in-flight transaction to finish first.
 */
export async function query<T = Record<string, unknown>>(
	sql: string,
	params: unknown[] = [],
): Promise<QueryResult<T>> {
	if (transactionStorage.getStore()) return { rows: selectAll<T>(sql, params) };

	const release = await acquireConnection();
	try {
		return { rows: selectAll<T>(sql, params) };
	} finally {
		release();
	}
}

/**
 * Run `fn` inside a transaction on the shared connection.
 *
 * `BEGIN IMMEDIATE` takes the write lock up front, so a transaction that will
 * write cannot fail halfway through on a lock upgrade. Commits when `fn`
 * resolves, rolls back when it throws. Repository calls made inside `fn` run on
 * the same connection (see `query`), so a multi-write sequence is all-or-nothing.
 *
 * Nested calls join the enclosing transaction instead of opening a second one.
 */
export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
	if (transactionStorage.getStore()) return fn();

	const release = await acquireConnection();
	const database = getDatabase();
	try {
		database.exec("BEGIN IMMEDIATE");
		try {
			const result = await transactionStorage.run(true, fn);
			database.exec("COMMIT");
			return result;
		} catch (err) {
			try {
				database.exec("ROLLBACK");
			} catch (rollbackErr) {
				// The connection is in an unknown state; surface both failures
				// rather than hiding the rollback behind the original error.
				console.error("[db] Rollback failed", rollbackErr);
			}
			throw err;
		}
	} finally {
		release();
	}
}

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

/**
 * Is this error a foreign-key violation?
 *
 * A dangling reference on INSERT/UPDATE reports `SQLITE_CONSTRAINT_FOREIGNKEY`
 * directly. `ON DELETE RESTRICT` is implemented as an internal trigger, so a
 * delete blocked by a referencing row surfaces as `SQLITE_CONSTRAINT_TRIGGER`
 * instead. The message is checked too, so an unrelated trigger failure is not
 * swallowed here.
 */
export function isForeignKeyViolation(err: unknown): boolean {
	if (typeof err !== "object" || err === null) return false;
	const { code, message } = err as { code?: string; message?: string };
	if (code === "SQLITE_CONSTRAINT_FOREIGNKEY") return true;
	return code === "SQLITE_CONSTRAINT_TRIGGER" && /FOREIGN KEY/i.test(message ?? "");
}

/** Is this error a UNIQUE constraint violation? */
export function isUniqueViolation(err: unknown): boolean {
	if (typeof err !== "object" || err === null) return false;
	const { code } = err as { code?: string };
	return code === "SQLITE_CONSTRAINT_UNIQUE" || code === "SQLITE_CONSTRAINT_PRIMARYKEY";
}

/** Is this error a CHECK constraint violation? */
export function isCheckViolation(err: unknown): boolean {
	if (typeof err !== "object" || err === null) return false;
	const { code } = err as { code?: string };
	return code === "SQLITE_CONSTRAINT_CHECK";
}

// ---------------------------------------------------------------------------
// Timestamps
// ---------------------------------------------------------------------------

/** The exact shape the schema's defaults produce. */
export function nowIso(): string {
	return new Date().toISOString();
}

/** `nowIso()` shifted forward by `days`. */
export function isoInDays(days: number): string {
	return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Repositories — identity
// ---------------------------------------------------------------------------

export interface UserRow {
	id: string;
	email: string;
	email_verified: number;
	name: string | null;
	display_name: string | null;
	avatar: string | null;
	role: string;
	google_sub: string | null;
	last_login_at: string | null;
	created_at: string;
	updated_at: string;
}

export const users = {
	/** Find by primary key. */
	async findById(id: string): Promise<UserRow | undefined> {
		return selectOne<UserRow>("SELECT * FROM users WHERE id = ?", [id]);
	},

	/** Find by Google subject — the primary lookup for sign-in. */
	async findByGoogleSub(googleSub: string): Promise<UserRow | undefined> {
		return selectOne<UserRow>("SELECT * FROM users WHERE google_sub = ?", [googleSub]);
	},

	/** Find by email, case-insensitively. */
	async findByEmail(email: string): Promise<UserRow | undefined> {
		return selectOne<UserRow>("SELECT * FROM users WHERE lower(email) = lower(?)", [email]);
	},

	/**
	 * Create or update the row for a Google identity.
	 *
	 * Matching order matters: `google_sub` first (stable across email changes),
	 * then verified email (links a pre-existing directory record to its Google
	 * account on first sign-in). Returns the resulting row.
	 */
	async upsertFromGoogle(input: {
		googleSub: string;
		email: string;
		emailVerified: boolean;
		name?: string | null;
		avatar?: string | null;
	}): Promise<UserRow> {
		const email = input.email.trim().toLowerCase();
		const existing =
			(await users.findByGoogleSub(input.googleSub)) ?? (await users.findByEmail(email));

		const timestamp = nowIso();

		if (existing) {
			execute(
				`UPDATE users
				    SET google_sub = ?, email = ?, email_verified = ?,
				        name = coalesce(?, name), avatar = coalesce(?, avatar),
				        last_login_at = ?
				  WHERE id = ?`,
				[
					input.googleSub,
					email,
					input.emailVerified,
					input.name ?? null,
					input.avatar ?? null,
					timestamp,
					existing.id,
				],
			);
			return (await users.findById(existing.id)) as UserRow;
		}

		const id = crypto.randomUUID();
		execute(
			`INSERT INTO users (id, email, email_verified, name, avatar, role, google_sub, last_login_at)
			 VALUES (?, ?, ?, ?, ?, 'user', ?, ?)`,
			[
				id,
				email,
				input.emailVerified,
				input.name ?? null,
				input.avatar ?? null,
				input.googleSub,
				timestamp,
			],
		);
		return (await users.findById(id)) as UserRow;
	},

	/** Users with no Google identity — they exist but cannot sign in. */
	async listUnlinked(): Promise<UserRow[]> {
		return selectAll<UserRow>(
			"SELECT * FROM users WHERE google_sub IS NULL ORDER BY lower(email)",
		);
	},

	async count(): Promise<number> {
		const row = selectOne<{ n: number }>("SELECT count(*) AS n FROM users");
		return row?.n ?? 0;
	},
};

export interface SessionRow {
	id: string;
	token_hash: string;
	user_id: string;
	created_at: string;
	expires_at: string;
	last_seen_at: string;
	user_agent: string | null;
	ip_hash: string | null;
}

export const sessions = {
	/**
	 * Create a session for `userId` and return the opaque token.
	 *
	 * Only the sha256 of the token is stored, so a database leak does not hand
	 * out live sessions.
	 */
	async create(input: {
		userId: string;
		token: string;
		tokenHash: string;
		ttlDays: number;
		userAgent?: string | null;
		ipHash?: string | null;
	}): Promise<SessionRow> {
		const id = crypto.randomUUID();
		const timestamp = nowIso();
		execute(
			`INSERT INTO sessions (id, token_hash, user_id, created_at, expires_at, last_seen_at, user_agent, ip_hash)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				id,
				input.tokenHash,
				input.userId,
				timestamp,
				isoInDays(input.ttlDays),
				timestamp,
				input.userAgent ?? null,
				input.ipHash ?? null,
			],
		);
		return (await sessions.findById(id)) as SessionRow;
	},

	async findById(id: string): Promise<SessionRow | undefined> {
		return selectOne<SessionRow>("SELECT * FROM sessions WHERE id = ?", [id]);
	},

	/** Look up a live session by the token's hash, with its user. */
	async findLiveByTokenHash(
		tokenHash: string,
	): Promise<{ session: SessionRow; user: UserRow } | undefined> {
		const session = selectOne<SessionRow>(
			"SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?",
			[tokenHash, nowIso()],
		);
		if (!session) return undefined;
		const user = await users.findById(session.user_id);
		if (!user) return undefined;
		return { session, user };
	},

	/** Slide the expiry forward. Returns the new expiry. */
	async touch(id: string, ttlDays: number): Promise<string> {
		const timestamp = nowIso();
		const expiresAt = isoInDays(ttlDays);
		execute("UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?", [
			timestamp,
			expiresAt,
			id,
		]);
		return expiresAt;
	},

	/** Revoke one session (logout). */
	async delete(id: string): Promise<boolean> {
		return execute("DELETE FROM sessions WHERE id = ?", [id]) > 0;
	},

	/** Revoke every session for a user (e.g. role change, compromise). */
	async deleteForUser(userId: string): Promise<number> {
		return execute("DELETE FROM sessions WHERE user_id = ?", [userId]);
	},

	/** Housekeeping: drop expired rows. */
	async deleteExpired(): Promise<number> {
		return execute("DELETE FROM sessions WHERE expires_at <= ?", [nowIso()]);
	},

	async count(): Promise<number> {
		const row = selectOne<{ n: number }>("SELECT count(*) AS n FROM sessions");
		return row?.n ?? 0;
	},
};
