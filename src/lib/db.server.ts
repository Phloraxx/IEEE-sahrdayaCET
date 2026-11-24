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
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { type Database as BetterSqliteDatabase, default as Database } from "better-sqlite3";
import {
	checkStorageLocation,
	IN_MEMORY_PATH,
	inspectDatabaseFile,
	migrateSchema,
	type MigrationResult,
	planSchema,
	readSchemaSql,
	refuseInvalidStorage,
	SCHEMA_VERSION,
	SchemaMigrationError,
	verifyBaseline,
} from "./db-migrate.server";
import { getEnv } from "./env.server";

/**
 * Schema version this build expects.
 *
 * 1 — initial release.
 * 2 — volunteer certificates: `event_volunteers`, nullable
 *     `certificates.registration_id` + `volunteer_id`, one-of CHECK, nullable
 *     `notification_outbox.registration_id`.
 *
 * The number and its forward migrations live in `./db-migrate.server.ts`. This
 * re-export keeps `SCHEMA_VERSION` (and therefore existing tests and docs that
 * name it) working. A change that is not purely additive needs a migration step
 * there; bumping the number alone will not alter an existing table.
 */
export { SCHEMA_VERSION };


// ---------------------------------------------------------------------------
// Connection singleton (HMR-safe)
// ---------------------------------------------------------------------------

interface DbGlobal {
	__ieeeSqlite?: BetterSqliteDatabase;
	/** The first failure to open or migrate, kept so every caller sees the same one. */
	__ieeeSqliteError?: unknown;
	/**
	 * What the *lazy* open did, so `checkDatabase()` reports the boot, not a
	 * second "none" from a file that was already current by the time it looks.
	 */
	__ieeeSqliteOutcome?: MigrationResult;
}

const globalForDb = globalThis as typeof globalThis & DbGlobal;

/**
 * Bring the connection to this build's schema, and prove it.
 *
 * Delegates to `./db-migrate.server.ts`, which classifies the database before
 * writing (fresh / reviewable v1 / v1 / v2 / newer / unknown), runs each upgrade
 * as one transaction, and rolls back on any failure. The old code bumped
 * `user_version` before validating and replayed `schema.sql` at a newer database;
 * both of those are now refusals with a named error code.
 *
 * A throw here is fatal by design: the process must not serve requests against a
 * database it cannot prove it understands.
 */
function migrateToCurrent(database: BetterSqliteDatabase): MigrationResult {
	return migrateSchema(database, {
		log: (message) => console.log(`[db] ${message}`),
	});
}

/**
 * Deployment environments in which the database is *existing storage*, not a
 * scratch file: production only. Staging deliberately creates its own database
 * (`scripts/deploy-local.sh` resets it), and tests and local dev use throwaway
 * paths.
 */
function strictStorage(): boolean {
	return (process.env.DEPLOY_ENV ?? "").trim().toLowerCase() === "production";
}

/**
 * Refuse to invent production storage.
 *
 * A missing `SQLITE_DATA_DIR` mount is the failure this exists for: `new
 * Database(path)` creates both the file and its parent directory, so a container
 * that lost its mount would boot cleanly onto an empty portal. The guard runs
 * before the connection is opened, with no pragma and no mkdir, and it closes
 * the probe connection on failure.
 */
function openGuarded(path: string): BetterSqliteDatabase {
	if (!strictStorage()) {
		// Staging and local: create the directory and the file, as before.
		if (path !== IN_MEMORY_PATH) mkdirSync(dirname(resolve(path)), { recursive: true });
		const database = new Database(path);
		configure(database);
		globalForDb.__ieeeSqliteOutcome = migrateToCurrent(database);
		return database;
	}

	// Production. `:memory:` can never be the production database.
	if (path === IN_MEMORY_PATH) refuseInvalidStorage(path, "in_memory");

	const located = checkStorageLocation(path, { enforce: true });
	if (!located.ok) {
		refuseInvalidStorage(path, located.reason ?? "unrecognised");
	}

	// `fileMustExist`: the guard proved the file is there, and this makes a
	// path-switch between the check and the open a hard error rather than a
	// silently created empty database.
	let probe: BetterSqliteDatabase;
	try {
		probe = new Database(path, { fileMustExist: true });
	} catch {
		// A wrong file can fail here rather than in the migration: a half-copied or
		// encrypted file has the SQLite header but cannot be opened. Report it as
		// storage, not as a crash.
		refuseInvalidStorage(path, "unrecognised");
	}

	// Configuration is applied only after the file is proven to hold a version
	// this build recognises, so a stray file's journal or synchronisation mode is
	// never changed. `planSchema` is read-only.
	try {
		const plan = planSchema(probe, readSchemaSql());
		if (plan.action === "create") {
			// A file exists but has no tables: a mis-pointed mount, not a database.
			refuseInvalidStorage(path, "unrecognised");
		}
		configure(probe);
		globalForDb.__ieeeSqliteOutcome = migrateToCurrent(probe);
		return probe;
	} catch (err) {
		probe.close();
		throw err;
	}
}

/**
 * The connection pragmas every open applies.
 *
 * WAL keeps readers off the writer's back and survives a crash; NORMAL syncs at
 * checkpoint rather than per commit (the documented trade: the last few
 * transactions can be lost on power loss, the database cannot corrupt). Foreign
 * keys are off by default in SQLite — without them every FK is decorative.
 */
function configure(database: BetterSqliteDatabase): void {
	database.pragma("journal_mode = WAL");
	database.pragma("synchronous = NORMAL");
	database.pragma("foreign_keys = ON");
	database.pragma("busy_timeout = 5000");
	database.pragma("wal_autocheckpoint = 1000");
}

function openDatabase(): BetterSqliteDatabase {
	return openGuarded(getEnv().SQLITE_PATH);
}

/**
 * The shared connection. Opened on first use, never closed by the app.
 *
 * A throw is remembered, not retried. `migrateToCurrent` always leaves the file
 * as it found it, so a second attempt reaches the same conclusion; retrying on
 * every statement would turn one startup refusal into a stream of them under
 * load, each re-reading `schema.sql`. Staying refused is the fail-safe: the
 * process must be restarted against a database it can prove it understands.
 */
function getDatabase(): BetterSqliteDatabase {
	if (globalForDb.__ieeeSqlite) return globalForDb.__ieeeSqlite;
	if (globalForDb.__ieeeSqliteError) throw globalForDb.__ieeeSqliteError;
	try {
		globalForDb.__ieeeSqlite = openDatabase();
		return globalForDb.__ieeeSqlite;
	} catch (err) {
		globalForDb.__ieeeSqliteError = err;
		throw err;
	}
}

/** Close and forget the connection. Tests only — the app never calls this. */
export function closeDatabase(): void {
	if (globalForDb.__ieeeSqlite) {
		globalForDb.__ieeeSqlite.close();
		globalForDb.__ieeeSqlite = undefined;
	}
	// Tests switch `SQLITE_PATH` between files; a remembered failure or outcome
	// from the previous file must not follow them.
	globalForDb.__ieeeSqliteError = undefined;
	globalForDb.__ieeeSqliteOutcome = undefined;
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

/**
 * Upper bound on cached statements.
 *
 * The claim that "the set of distinct statements is fixed by the code paths" is
 * true for the repositories and false for the generic collection endpoint, which
 * assembles SQL from the request: every distinct filter/sort shape is a distinct
 * string. Without a cap that is unbounded memory growth reachable by any
 * authenticated user.
 *
 * Eviction is least-recently-used, not a full clear. A clear is simpler but
 * evicts exactly the wrong entries: the repository statements are prepared on
 * first use and then hit on every request, while the generated collection-endpoint
 * statements are usually used once. Clearing would drop the hot set to make room
 * for the cold set, and the next request would re-parse it. `Map` preserves
 * insertion order, so re-inserting on a hit keeps the least-recently-used entry
 * at the front of the iteration order.
 */
const STATEMENT_CACHE_LIMIT = 512;

/** Exported for tests: the cache bound and its current size. */
export const __dbTesting = {
	cacheSize: () => statementCache.size,
	cacheLimit: STATEMENT_CACHE_LIMIT,
	/**
	 * The `AsyncLocalStorage` that marks a `withTransaction` chain. A getter,
	 * because it is declared below. Tests read it to prove a repository call ran
	 * on the transaction rather than beside it; nothing in the app reaches for it.
	 */
	get transactionStorage(): AsyncLocalStorage<true> {
		return transactionStorage;
	},
};

/** The connection the cached statements were prepared on. */
let preparedOn: BetterSqliteDatabase | undefined;

function prepare(sql: string): Database.Statement {
	const cached = statementCache.get(sql);
	if (cached) {
		// Re-insert so this statement becomes the most recently used entry. Two Map
		// operations per query is far cheaper than re-parsing and re-planning SQL.
		statementCache.delete(sql);
		statementCache.set(sql, cached);
		return cached;
	}

	// A statement belongs to the connection it was prepared on. `closeDatabase`
	// clears the cache, but a statement prepared between that close and a re-open
	// would otherwise survive into the new connection and fail with
	// SQLITE_MISUSE. The app never closes; tests do, between files.
	if (statementCache.size > 0 && preparedOn !== getDatabase()) {
		statementCache.clear();
	}
	preparedOn = getDatabase();

	if (statementCache.size >= STATEMENT_CACHE_LIMIT) {
		const oldest = statementCache.keys().next();
		if (!oldest.done) statementCache.delete(oldest.value);
	}

	const statement = getDatabase().prepare(sql);
	statementCache.set(sql, statement);
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
 *
 * Why the queue
 * -------------
 * This used to run straight on the shared connection, so a repository call made
 * while another request held the connection inside `withTransaction` — including
 * any `await` in its body — would execute inside *that* transaction and be
 * committed or rolled back with it. `users` and `sessions` below are such calls,
 * and they are on the sign-in path. Everything now goes through the same
 * transaction-aware path as `query()`:
 *
 * - inside `withTransaction`, join the open transaction (one atomic unit);
 * - outside it, take the connection lock, so the statement cannot land inside
 *   another request's transaction.
 */
async function selectAll<T>(sql: string, params: unknown[] = []): Promise<T[]> {
	const statement = prepare(sql);
	const values = bindAll(params);
	const read = (): T[] => {
		if (!statement.reader) {
			statement.run(...values);
			return [];
		}
		return statement.all(...values) as T[];
	};
	return runOnConnection(read);
}

/** Run a statement and return its first row, if any. Same queueing as `selectAll`. */
async function selectOne<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
	const statement = prepare(sql);
	const values = bindAll(params);
	const read = (): T | undefined => statement.get(...values) as T | undefined;
	return runOnConnection(read);
}

/** Run a write and return the number of affected rows. Same queueing as `selectAll`. */
async function execute(sql: string, params: unknown[] = []): Promise<number> {
	const statement = prepare(sql);
	const values = bindAll(params);
	const write = (): number => statement.run(...values).changes;
	return runOnConnection(write);
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

/**
 * The connection lock, hand to hand.
 *
 * The lock is strictly first-in-first-out. A caller that already holds it and
 * asks again would queue behind itself, so nothing may reach for it a second
 * time: every path here checks `transactionStorage` first (`query`,
 * `withTransaction`, `runOnConnection`), and the transaction's own body runs on
 * the transaction. `AsyncLocalStorage` marks the chain a callback runs on rather
 * than who holds the lock, which is why the check has to come first.
 */
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
 * Run `statement` on the connection without corrupting an open transaction.
 *
 * - Inside `withTransaction`, it joins the transaction — the caller asked for one
 *   atomic unit, so a second connection is not merely unnecessary, it is wrong.
 * - Outside one, it takes the lock, so it cannot land inside another request's
 *   open transaction.
 */
async function runOnConnection<T>(statement: () => T): Promise<T> {
	if (transactionStorage.getStore()) return statement();

	const release = await acquireConnection();
	try {
		return statement();
	} finally {
		release();
	}
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
	return { rows: await selectAll<T>(sql, params) };
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

/**
 * Weekly housekeeping: refresh query-planner statistics and fold the WAL back
 * into the database.
 *
 * Runs inside the connection lock, so it cannot interleave with a request. Both
 * statements are short on a database this size; a long one would stall the event
 * loop, which is why this is the only maintenance the app does in-process.
 */
export async function runMaintenance(): Promise<void> {
	const release = await acquireConnection();
	try {
		const database = getDatabase();
		database.pragma("optimize");
		database.pragma("wal_checkpoint(TRUNCATE)");
	} finally {
		release();
	}
}

// ---------------------------------------------------------------------------
// Startup contract
// ---------------------------------------------------------------------------

/** What a startup check found and did. Safe to log or return from a route. */
export interface DatabaseReadiness {
	path: string;
	/** `none` means the file was already current; see `MigrationResult`. */
	action: MigrationResult["action"];
	from: number;
	to: number;
	/** True when `user_version` was missing and the shape was inferred. */
	reviewed: boolean;
	tables: number;
}

/**
 * Open (or adopt) the application database and prove it is this build's schema.
 *
 * This is the startup contract: call it once before serving. On success it
 * resolves with what it did; on a database this build cannot safely use it
 * rejects with a `SchemaMigrationError` whose `code` is one of
 * `DB_STORAGE_INVALID` (production storage was not found populated),
 * `DB_NEWER_THAN_BUILD`, `DB_UNRECOGNISED`, `DB_SHAPE_INVALID`, `DB_TOO_OLD`,
 * `MIGRATION_FAILED`, `MIGRATION_VERIFY_FAILED` or `SCHEMA_FILE_MISSING`.
 *
 * It never deletes, truncates or recreates a file. A refused database is named
 * in the error, and the operator decides — usually by restoring a backup or
 * rolling the image back.
 */
export async function checkDatabase(): Promise<DatabaseReadiness> {
	const release = await acquireConnection();
	try {
		const database = getDatabase();
		verifyBaseline(database, { expectVersion: SCHEMA_VERSION });
		const tables = (
			database
				.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
				.get() as { n: number }
		).n;
		const outcome = globalForDb.__ieeeSqliteOutcome;
		return {
			path: getEnv().SQLITE_PATH,
			action: outcome?.action ?? "none",
			from: outcome?.from ?? SCHEMA_VERSION,
			to: SCHEMA_VERSION,
			reviewed: outcome?.reviewed ?? false,
			tables,
		};
	} finally {
		release();
	}
}

/**
 * Boot-time check for the single-process server entry point.
 *
 * `src/lib/db.server.ts` opens and migrates lazily on first use, which keeps
 * tests and scripts that never touch the database from creating one. The server
 * entry should call this once so a refusal is a startup failure with a clear log
 * line, not a 500 on the first request. It is intentionally not wired into the
 * entry point in this change: that file is outside this lane, and the lazy path
 * already fails safe with the same codes.
 */
export async function prepareDatabaseForStartup(
	options: { logger?: (line: string) => void } = {},
): Promise<DatabaseReadiness> {
	const log = options.logger ?? ((line: string) => console.log(line));
	try {
		// Force the lazy open, which runs the migration.
		const database = getDatabase();
		const readiness = await checkDatabase();
		log(
			`[db] ready: ${readiness.path} schema v${readiness.to}` +
				` (${readiness.action === "none" ? "already current" : `${readiness.action} from v${readiness.from}`}), ` +
				`${readiness.tables} tables`,
		);
		database.pragma("optimize");
		return readiness;
	} catch (err) {
		if (err instanceof SchemaMigrationError) {
			log(`[db] refusing to start: ${err.code} — ${err.message}`);
			if (err.detail !== undefined) log(`[db] detail: ${JSON.stringify(err.detail)}`);
		}
		throw err;
	}
}

/** Pre-flight a database file without opening or changing it. See `inspectDatabaseFile`. */
export { inspectDatabaseFile };

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
		const row = await selectOne<UserRow>("SELECT * FROM users WHERE id = ?", [id]);
		return row;
	},

	/** Find by Google subject — the primary lookup for sign-in. */
	async findByGoogleSub(googleSub: string): Promise<UserRow | undefined> {
		return await selectOne<UserRow>("SELECT * FROM users WHERE google_sub = ?", [googleSub]);
	},

	/** Find by email, case-insensitively. */
	async findByEmail(email: string): Promise<UserRow | undefined> {
		return await selectOne<UserRow>("SELECT * FROM users WHERE lower(email) = lower(?)", [email]);
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
		// Linking a pre-existing directory record to a Google identity is only
		// safe when Google says the address is verified. The flag was stored and
		// never consulted.
		const existing = await users.findByGoogleSub(input.googleSub);
		const byEmail = existing ? undefined : await users.findByEmail(email);
		if (byEmail && !input.emailVerified) {
			throw new Error("Google did not verify this email address");
		}
		const matched = existing ?? byEmail;

		const timestamp = nowIso();

		if (matched) {
			await execute(
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
					matched.id,
				],
			);
			return (await users.findById(matched.id)) as UserRow;
		}

		const id = crypto.randomUUID();
		await execute(
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
		return await selectAll<UserRow>(
			"SELECT * FROM users WHERE google_sub IS NULL ORDER BY lower(email)",
		);
	},

	async count(): Promise<number> {
		const row = await selectOne<{ n: number }>("SELECT count(*) AS n FROM users");
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
		await execute(
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
		return await selectOne<SessionRow>("SELECT * FROM sessions WHERE id = ?", [id]);
	},

	/** Look up a live session by the token's hash, with its user. */
	async findLiveByTokenHash(
		tokenHash: string,
	): Promise<{ session: SessionRow; user: UserRow } | undefined> {
		const session = await selectOne<SessionRow>(
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
		await execute("UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?", [
			timestamp,
			expiresAt,
			id,
		]);
		return expiresAt;
	},

	/** Revoke one session (logout). */
	async delete(id: string): Promise<boolean> {
		return (await execute("DELETE FROM sessions WHERE id = ?", [id])) > 0;
	},

	/** Revoke every session for a user (e.g. role change, compromise). */
	async deleteForUser(userId: string): Promise<number> {
		return await execute("DELETE FROM sessions WHERE user_id = ?", [userId]);
	},

	/** Housekeeping: drop expired rows. */
	async deleteExpired(): Promise<number> {
		return await execute("DELETE FROM sessions WHERE expires_at <= ?", [nowIso()]);
	},

	async count(): Promise<number> {
		const row = await selectOne<{ n: number }>("SELECT count(*) AS n FROM sessions");
		return row?.n ?? 0;
	},
};
