/**
 * Versioned SQLite schema migration, run at startup before the first request.
 *
 * Why this exists
 * ---------------
 * `sqlite/schema.sql` is the schema baseline and stays the only schema source of
 * truth, but it can only `CREATE` — it cannot alter a table that already exists.
 * The previous boot path re-executed it and then bumped `PRAGMA user_version`,
 * which was wrong in four separate ways:
 *
 * 1. It bumped the version before proving the result was the shape this build
 *    needs, so a failed check left a database stamped as current.
 * 2. It ignored a database newer than the build, and would "upgrade" it by
 *    replaying an older baseline over its tables.
 * 3. It had no path forward for a column change. The shipped v2 database
 *    (`certificates.registration_id` made nullable, `volunteer_id` added) could
 *    only be rebuilt by re-running the PocketBase cutover, which means data loss
 *    for anything written after cutover.
 * 4. Nothing validated the shape before writing, so the first symptom was a
 *    runtime failure on the one code path that touches a newer column.
 *
 * What it does instead
 * --------------------
 * A database is opened, inspected and classified **before any write**:
 *
 * ```text
 * user_version 0, no tables           -> fresh          create the baseline
 * user_version 0, shipped v1 shape    -> (review)       v1 -> v2
 * user_version 1, shipped v1 shape    -> 1 -> 2
 * user_version 2, current v2 shape    -> up to date
 * user_version N > 2                  -> refuse (newer build wrote it)
 * anything else                       -> refuse (unknown shape)
 * ```
 *
 * Each upgrade is a forward step inside **one** `BEGIN IMMEDIATE` … `COMMIT`,
 * with `PRAGMA foreign_keys` off for the duration (the SQLite-documented table
 * rebuild procedure), a row-count match on every rebuilt table, and
 * `foreign_key_check` before the commit. A failure rolls the whole step back and
 * leaves `user_version` exactly where it was.
 *
 * Error contract
 * --------------
 * Every refusal raises `SchemaMigrationError` with a `code`. Startup maps the
 * codes to an operator message and never truncates, deletes or recreates a
 * database it does not understand. A synthetic CI database is a fresh file and
 * takes the fresh path; the staging reset deletes its file and also takes it.
 *
 * This module talks to `better-sqlite3` directly rather than through
 * `db.server.ts`'s queue: it runs once, synchronously, before the connection
 * singleton exists, so there is nothing else that could interleave with it.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import BetterSqlite3 from "better-sqlite3";

/** The open connection type. */
type Database = BetterSqlite3.Database;

/** Schema version this build expects and writes. */
export const SCHEMA_VERSION = 2;

/**
 * Oldest database shape this build can still bring forward.
 *
 * 1 is the initial SQLite release; 2 added volunteers as certificate owners.
 * A `user_version` below this (other than a never-initialised 0) is refused:
 * there is no migration for it, and pretending there is would guess at data.
 */
export const MIN_SUPPORTED_VERSION = 1;

/** The marker for "never initialised". Also what PocketBase-era files carry. */
const UNINITIALISED = 0;

/** `:memory:` opens a private in-memory database — used by tests. */
export const IN_MEMORY_PATH = ":memory:";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type SchemaMigrationErrorCode =
	/** A version above {@link SCHEMA_VERSION}: a newer build wrote this file. */
	| "DB_NEWER_THAN_BUILD"
	/** Below {@link MIN_SUPPORTED_VERSION} and not uninitialised. */
	| "DB_TOO_OLD"
	/** Uninitialised file whose tables are not a shipped SQLite shape. */
	| "DB_UNRECOGNISED"
	/** A known version whose columns/objects are not that version's shape. */
	| "DB_SHAPE_INVALID"
	/** The schema baseline could not be read from disk. */
	| "SCHEMA_FILE_MISSING"
	/** A migration step threw; everything is rolled back. */
	| "MIGRATION_FAILED"
	/** Post-migration verification failed; everything is rolled back. */
	| "MIGRATION_VERIFY_FAILED"
	/** Production storage is absent, empty, in-memory, or an unrecognised file. */
	| "DB_STORAGE_INVALID";

/**
 * A refused or failed schema migration.
 *
 * `code` is stable and meant to be matched; `message` is for the operator and
 * already says what to do. `detail` carries the specific shape problem so a log
 * line is actionable without a debugger.
 */
export class SchemaMigrationError extends Error {
	readonly code: SchemaMigrationErrorCode;
	readonly detail: unknown;

	constructor(code: SchemaMigrationErrorCode, message: string, detail?: unknown) {
		super(message);
		this.name = "SchemaMigrationError";
		this.code = code;
		this.detail = detail;
	}
}

// ---------------------------------------------------------------------------
// Schema baseline
// ---------------------------------------------------------------------------

/**
 * Locations `sqlite/schema.sql` is tried from, in order.
 *
 * The app boots from the repository root (dev server, `scripts/*`) and from
 * `/app` inside the runtime image, where the repository root *is* the working
 * directory and the file is copied alongside the build. A wrong working
 * directory is an operator error, not a reason to run without a schema, so the
 * caller turns a miss into `SCHEMA_FILE_MISSING` rather than an empty schema.
 */
function candidateSchemaPaths(): string[] {
	const paths = [resolve(process.cwd(), "sqlite", "schema.sql")];
	// `npm start` runs from the repository root; a built artifact runs from
	// `build/server`. Walking up is deterministic and finds the repo root.
	let dir = resolve(process.cwd());
	for (let i = 0; i < 3; i += 1) {
		dir = resolve(dir, "..");
		paths.push(resolve(dir, "sqlite", "schema.sql"));
	}
	return [...new Set(paths)];
}

/** Read `sqlite/schema.sql`, or throw `SCHEMA_FILE_MISSING` naming the paths. */
export function readSchemaSql(): string {
	const tried = candidateSchemaPaths();
	for (const path of tried) {
		if (existsSync(path)) return readFileSync(path, "utf8");
	}
	throw new SchemaMigrationError(
		"SCHEMA_FILE_MISSING",
		"sqlite/schema.sql was not found. Run from the repository root, or make sure the " +
			"image contains sqlite/schema.sql next to the app.",
		{ tried },
	);
}

// ---------------------------------------------------------------------------
// Shape vocabulary
// ---------------------------------------------------------------------------

type ObjectType = "table" | "index" | "trigger";

export interface ObjectRequirement {
	type: ObjectType;
	name: string;
	/**
	 * For a table that has to be rebuilt: the indexes over it, dropped first and
	 * re-created by the baseline afterwards. `v1 -> v2` cannot reuse v2's index on
	 * a v1 table, so listing them here keeps the drop and the rebuild together.
	 */
	indexes?: string[];
	/**
	 * Columns the object's SQL must mention. This is a cheap identity check, not
	 * a parser: a shape that lacks `volunteer_id` is not v2, whatever its
	 * `user_version` says, even if the table exists from some other history.
	 */
	columns?: string[];
}

/**
 * The minimum set of objects that make a database the shipped v1 or v2 shape.
 *
 * Deliberately a subset: a database is only ever *identified* by these. The
 * full baseline is proven the other way round — `schema.sql` re-applied to a
 * current database must create nothing (see `verifyBaseline`).
 *
 * Every entry is written from the committed `sqlite/schema.sql`; the integration
 * suite builds both shapes from this repository and walks them, so an entry that
 * drifts from the file fails there rather than at someone's startup.
 */
export const SHAPE_MARKERS: Record<1 | 2, ObjectRequirement[]> = {
	1: [
		{ type: "table", name: "users" },
		{ type: "table", name: "sessions" },
		{ type: "table", name: "societies" },
		{ type: "table", name: "events" },
		{ type: "table", name: "event_sessions" },
		{ type: "table", name: "registrations" },
		{ type: "table", name: "attendance_records" },
		{ type: "table", name: "certificate_templates" },
		{ type: "table", name: "certificate_batches" },
		{ type: "table", name: "certificates" },
		{ type: "table", name: "notification_outbox" },
		{ type: "table", name: "admin_audit_log" },
		{ type: "index", name: "certificates_reg_batch_uq" },
		{ type: "index", name: "notification_outbox_dedupe_uq" },
		{ type: "trigger", name: "users_touch" },
		{ type: "trigger", name: "certificates_touch" },
	],
	2: [
		{ type: "table", name: "event_volunteers" },
		{ type: "index", name: "event_volunteers_event_idx" },
		{ type: "index", name: "certificates_volunteer_batch_uq" },
		{ type: "trigger", name: "event_volunteers_touch" },
		{
			type: "table",
			name: "certificates",
			columns: ["volunteer_id"],
			indexes: [
				"certificates_credential_uq",
				"certificates_token_uq",
				"certificates_reg_batch_uq",
				"certificates_volunteer_batch_uq",
				"certificates_event_idx",
			],
		},
		{
			type: "table",
			name: "notification_outbox",
			columns: ["registration_id", "certificate_id"],
			indexes: ["notification_outbox_dedupe_uq", "notification_outbox_status_idx"],
		},
	],
};

// ---------------------------------------------------------------------------
// Inspection (read-only)
// ---------------------------------------------------------------------------

interface SchemaObjectRow {
	type: string;
	name: string;
	sql: string | null;
}

/** Everything the classifier needs, read without writing. */
interface Inspection {
	userVersion: number;
	tableNames: string[];
	/** Only real tables, so views cannot impersonate one. */
	objects: Map<string, SchemaObjectRow>;
}

function inspect(database: Database): Inspection {
	const userVersion = database.pragma("user_version", { simple: true }) as number;
	const rows = database
		.prepare("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'")
		.all() as SchemaObjectRow[];
	return {
		userVersion,
		tableNames: rows.filter((row) => row.type === "table").map((row) => row.name).sort(),
		objects: new Map(rows.map((row) => [`${row.type}:${row.name}`, row])),
	};
}

/**
 * Does this database satisfy every marker?
 *
 * A table marker cannot check its own SQL for a column reliably (`ALTER TABLE
 * ADD COLUMN` rewrites the stored SQL, a rebuild rewrites it differently), so a
 * table's columns are read from `pragma_table_info` instead. An index or trigger
 * has no such pragma and is matched on the text of its definition.
 */
function satisfies(database: Database, inspection: Inspection, version: 1 | 2): boolean {
	for (const requirement of SHAPE_MARKERS[version]) {
		if (requirement.type !== "table") {
			const actual = inspection.objects.get(`${requirement.type}:${requirement.name}`);
			if (!actual || !actual.sql) return false;
			// `schema.sql` names a column contiguously in its own line breaks, so a
			// plain substring test is enough to tell `certificate_id, registration_id`
			// from a definition that keeps `registration_id NOT NULL`.
			if (requirement.type === "index" && requirement.name === "certificates_reg_batch_uq") {
				if (/registration_id\s+TEXT\s+NOT\s+NULL/i.test(actual.sql)) return false;
			}
			continue;
		}

		const table = inspection.objects.get(`table:${requirement.name}`);
		if (!table) return false;
		if (!requirement.columns?.length) continue;
		const present = new Set(
			(
				database.prepare(`SELECT name FROM pragma_table_info(?)`).all(requirement.name) as {
					name: string;
				}[]
			).map((row) => row.name),
		);
		for (const column of requirement.columns) if (!present.has(column)) return false;
	}
	return true;
}

/** Column names of a table, or an empty list if it does not exist. */
function columnsOf(database: Database, table: string): string[] {
	return (
		database.prepare("SELECT name FROM pragma_table_info(?)").all(table) as { name: string }[]
	).map((row) => row.name);
}

/**
 * The v2 column shape of the three tables v1→v2 touches.
 *
 * Used as a *veto* in the uninitialised case: an old file that has all three
 * tables but carries `certificates.volunteer_id` was written by a v2 build and
 * simply lost its version marker, so it is reviewed, not stamped. A false
 * negative (v1 renamed a column v2 adds) only means a reviewable database is
 * refused — which is the safe direction.
 */
const V2_ONLY_COLUMNS: Record<string, string[]> = {
	certificates: ["volunteer_id"],
	event_volunteers: ["event_id"],
	notification_outbox: ["certificate_id"],
};

function carriesV2Columns(database: Database, inspection: Inspection): boolean {
	for (const [table, required] of Object.entries(V2_ONLY_COLUMNS)) {
		if (!inspection.objects.has(`table:${table}`)) return false;
		const present = new Set(columnsOf(database, table));
		if (!required.every((column) => present.has(column))) return false;
	}
	return true;
}

/** A table or trigger that exists in a file we are about to treat as fresh. */
const ROOT_MARKERS: ObjectRequirement[] = [
	{ type: "table", name: "users" },
	{ type: "table", name: "sessions" },
	{ type: "table", name: "certificates" },
	{ type: "trigger", name: "users_touch" },
];

/** Table names `sqlite/schema.sql` creates, parsed from the file once. */
export function baselineTableNames(schemaSql: string): string[] {
	const names = new Set<string>();
	for (const match of schemaSql.matchAll(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+("?)([a-z_][a-z0-9_]*)\1/gi)) {
		const name = match[2];
		if (name) names.add(name);
	}
	return [...names].sort();
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * What the inspection concluded.
 *
 * `action` is what will be done; `reviewed` says whether the version marker had
 * to be inferred from the tables. An inferred version is written only after the
 * upgrade and verification succeed, so a refusal leaves `user_version` as it was.
 */
export type SchemaPlan =
	| { action: "create"; from: "fresh"; userVersion: 0 }
	/**
	 * No marker. `review` records the version the tables prove they are: 1 for a
	 * shipped v1 shape, {@link SCHEMA_VERSION} for a current one that lost its
	 * marker.
	 */
	| { action: "review"; from: 1 | 2; userVersion: 0 }
	| { action: "upgrade"; from: 1; userVersion: 1 }
	| { action: "none"; from: 2; userVersion: 2 };

/**
 * Decide what to do, or throw. Pure apart from the read-only queries it makes.
 *
 * The order matters: the version is checked *first*, so a newer database is
 * refused before anything looks at its tables, and an uninitialised file is only
 * treated as fresh when it is genuinely empty of this app's tables.
 */
export function planSchema(database: Database, schemaSql: string): SchemaPlan {
	const inspection = inspect(database);
	const { userVersion, tableNames } = inspection;
	const hasRoots = ROOT_MARKERS.some((marker) => {
		const found = inspection.objects.get(`${marker.type}:${marker.name}`);
		return Boolean(found);
	});

	if (userVersion > SCHEMA_VERSION) {
		throw new SchemaMigrationError(
			"DB_NEWER_THAN_BUILD",
			`This database is schema version ${userVersion}; this build only understands up to ` +
				`${SCHEMA_VERSION}. Deploy the build that wrote it, or restore a backup taken before it. ` +
				"Nothing was changed.",
			{ userVersion, supported: SCHEMA_VERSION },
		);
	}

	if (userVersion > UNINITIALISED) {
		if (userVersion < MIN_SUPPORTED_VERSION) {
			throw new SchemaMigrationError(
				"DB_TOO_OLD",
				`This database is schema version ${userVersion}; the oldest this build can migrate is ` +
					`${MIN_SUPPORTED_VERSION}. Rebuild it with scripts/migrate-pb-to-sqlite.ts. ` +
					"Nothing was changed.",
				{ userVersion, floor: MIN_SUPPORTED_VERSION },
			);
		}
		if (userVersion === SCHEMA_VERSION) {
			if (!satisfies(database, inspection, SCHEMA_VERSION)) {
				throw new SchemaMigrationError(
					"DB_SHAPE_INVALID",
					`This database claims schema version ${userVersion} but is missing the v${userVersion} ` +
						"shape (see SHAPE_MARKERS in src/lib/db-migrate.server.ts). Restore a backup, or " +
						"inspect it with the integration fixture. Nothing was changed.",
					{ userVersion, tables: tableNames },
				);
			}
			return { action: "none", from: 2, userVersion: SCHEMA_VERSION };
		}
		// userVersion === 1
		if (!satisfies(database, inspection, 1)) {
			throw new SchemaMigrationError(
				"DB_SHAPE_INVALID",
				"This database claims schema version 1 but is not the shipped v1 shape. It was " +
					"probably hand-edited or partially restored. Restore a backup. Nothing was changed.",
				{ userVersion, tables: tableNames },
			);
		}
		return { action: "upgrade", from: 1, userVersion: 1 };
	}

	// userVersion === 0: never initialised, or written by a build that could not
	// bump it. Decide from the tables.
	if (!hasRoots) {
		// A genuinely empty file: no tables at all, or only unrelated ones (a stray
		// template file). The baseline creates only `CREATE IF NOT EXISTS` objects,
		// so an unrelated table cannot collide with it.
		if (tableNames.length > 0) {
			const baseline = new Set(baselineTableNames(schemaSql));
			const foreign = tableNames.filter((name) => !baseline.has(name));
			if (foreign.length > 0) {
				throw new SchemaMigrationError(
					"DB_UNRECOGNISED",
					`This database file is at ${database.name} and has no IEEE tables, but it is not ` +
						"empty either. Refusing to write a schema into a file that belongs to something " +
						`else (found: ${foreign.slice(0, 8).join(", ")}). Nothing was changed.`,
					{ userVersion, tables: tableNames },
				);
			}
		}
		return { action: "create", from: "fresh", userVersion: 0 };
	}

	// It has this app's tables but no version marker. Only a file that proves it
	// is exactly v1 is taken forward, and only a file that proves it is already v2
	// gets its marker back. Anything in between — v1 with one v2 object, v2 with
	// one column missing — is refused: it is not a version this code can name, and
	// a rebuild against it could lose data.
	if (satisfies(database, inspection, 1) && !carriesV2Columns(database, inspection)) {
		return { action: "review", from: 1, userVersion: 0 };
	}
	if (satisfies(database, inspection, SCHEMA_VERSION)) {
		return { action: "review", from: SCHEMA_VERSION, userVersion: 0 };
	}
	throw new SchemaMigrationError(
		"DB_UNRECOGNISED",
		"This database has IEEE tables but no schema version marker, so its shape cannot be " +
			"trusted. It is not the shipped v1 shape. Restore a backup taken from a released " +
			"build. Nothing was changed.",
		{ userVersion, tables: tableNames },
	);
}

// ---------------------------------------------------------------------------
// Storage guard (production)
// ---------------------------------------------------------------------------

/** Why production storage was refused, in the operator's words. */
export type StorageGuardReason =
	/** `SQLITE_PATH` is `:memory:`. */
	| "in_memory"
	/** Nothing exists at the path. */
	| "missing"
	/** A file exists but is zero bytes — a mis-pointed mount or a bare `touch`. */
	| "empty"
	/** The file is not a SQLite database, or is not this app's. */
	| "unrecognised";

export interface StorageGuardOptions {
	/** Production mode. `false` (staging, tests, local) never refuses. */
	enforce?: boolean;
}

export interface StorageGuardResult {
	/** `true` when the location is fine to open as it is. */
	ok: boolean;
	/** Why it is not, when `ok` is false. */
	reason?: StorageGuardReason;
}

/**
 * Decide whether a location may be opened at all, before anything is created.
 *
 * Production runs on a bind mount (`SQLITE_DATA_DIR`). If that mount is missing
 * or was not restored, `new Database(path)` would happily succeed — it creates
 * the file and its parent directory — and the app would serve an empty portal
 * that looks healthy. This is the guard against that: it only inspects, and it
 * does so before anything opens the file for writing.
 *
 * It refuses only in production. Staging deliberately creates its file, and tests
 * use throwaway paths, so both keep working.
 */
export function checkStorageLocation(
	path: string,
	options: StorageGuardOptions = {},
): StorageGuardResult {
	if (!options.enforce) return { ok: true };

	if (path === IN_MEMORY_PATH) return { ok: false, reason: "in_memory" };
	if (!existsSync(path)) return { ok: false, reason: "missing" };

	let size: number;
	try {
		size = statSync(path).size;
	} catch {
		return { ok: false, reason: "missing" };
	}

	if (size === 0) return { ok: false, reason: "empty" };

	// A non-SQLite file. The 16-byte header is the cheap test; a WAL-mode database
	// keeps its header in the main file, so this is reliable.
	try {
		const header = readFileSync(path).subarray(0, 16).toString("latin1");
		if (header !== "SQLite format 3\u0000") return { ok: false, reason: "unrecognised" };
	} catch {
		return { ok: false, reason: "missing" };
	}

	return { ok: true };
}

/**
 * The production refusal, with the operator action attached.
 *
 * Split from `checkStorageLocation` so a caller can report the state without
 * building a message (tests, health checks), and so the wording lives in one
 * place.
 */
export function refuseInvalidStorage(path: string, reason: StorageGuardReason): never {
	const where = `SQLITE_PATH is ${path}`;
	const message: Record<StorageGuardReason, string> = {
		in_memory:
			`${where}, which is ":memory:". A process-private database cannot be production ` +
			"storage, and it would silently discard every write on restart.",
		missing:
			`${where}, and nothing exists there. The database volume is probably not mounted, or it ` +
			"was not restored. Mount it and restore a backup with scripts/restore-backup.ts. " +
			"Creating a new empty database is a separate, explicit action (scripts/init-database.ts), " +
			"never something a boot does.",
		empty:
			`${where}, and the file is empty (0 bytes), so nothing was mounted or restored at that ` +
			"path. Restore a backup with scripts/restore-backup.ts, or provision deliberately with " +
			"scripts/init-database.ts.",
		unrecognised:
			`${where}, but that file is not a SQLite database this build can read. Check that ` +
			"SQLITE_DATA_DIR points at portal.db itself and not at the mount directory, a backup " +
			"archive or another file.",
	};
	throw new SchemaMigrationError("DB_STORAGE_INVALID", `production storage refused: ${message[reason]}`, {
		path,
		reason,
	});
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

/**
 * Run `fn` as one atomic schema step with foreign keys off.
 *
 * SQLite's table-rebuild procedure requires `PRAGMA foreign_keys = OFF` *outside*
 * a transaction; the pragma is a no-op inside one. So the order is: turn keys
 * off, open the transaction, work, check foreign keys with `foreign_key_check`
 * (which is allowed while keys are off), commit, then trust SQLite's own
 * rollback on failure. Trigger creation is not affected by the pragma.
 *
 * When `intended` is given (production), `fn`'s writes are compared against it:
 * a statement that creates, drops or rewrites an object the plan did not call
 * for aborts the whole step and rolls back. Production must not print a new
 * schema into a file whose shape it did not already recognise.
 */
function inStep<T>(
	database: Database,
	label: string,
	fn: () => T,
	intended?: SchemaPlan,
): T {
	return inStepSync(database, label, () => fn(), intended);
}

/**
 * The synchronous body of `inStep`, exposed so a caller that already runs inside
 * a guard can nest one step without re-guarding (a nested guard would compare
 * the plan against writes that are legitimately in flight).
 */
function inStepSync<T>(database: Database, label: string, fn: () => T, intended?: SchemaPlan): T {
	const foreignKeysWereOn = (database.pragma("foreign_keys", { simple: true }) as number) === 1;
	database.pragma("foreign_keys = OFF");
	try {
		database.exec("BEGIN IMMEDIATE");
		try {
			const before = intended ? schemaFingerprint(database) : null;
			const result = fn();
			if (intended && before) {
				const after = schemaFingerprint(database);
				const drift = unintendedObjects(before, after, intended);
				if (drift.length > 0) {
					throw new SchemaMigrationError(
						"DB_UNRECOGNISED",
						`${label} would have created or rewritten ${drift.length} object(s) this ` +
							"database's shape did not call for " +
							`(${drift.slice(0, 6).join(", ")}). Rolled back; nothing was written.`,
						{ drift },
					);
				}
			}
			const violations = database.pragma("foreign_key_check") as unknown[];
			if (violations.length > 0) {
				throw new SchemaMigrationError(
					"MIGRATION_VERIFY_FAILED",
					`${label} left ${violations.length} foreign-key violation(s); rolled back.`,
					violations.slice(0, 5),
				);
			}
			database.exec("COMMIT");
			return result;
		} catch (err) {
			try {
				database.exec("ROLLBACK");
			} catch (rollbackError) {
				console.error(`[db:migrate] rollback after ${label} failed`, rollbackError);
			}
			throw err;
		}
	} finally {
		if (foreignKeysWereOn) database.pragma("foreign_keys = ON");
	}
}

/**
 * Every schema object and its exact definition, as one comparable string.
 *
 * `sqlite_master.sql` is what a create, drop or `ALTER … RENAME` changes, and an
 * `ALTER … ADD COLUMN` rewrites it too, so this captures all of them. Row data is
 * not included: a v1 → v2 copy writes rows, and the row counts are checked
 * separately.
 */
function schemaFingerprint(database: Database): Map<string, string> {
	const rows = database
		.prepare("SELECT type, name, coalesce(sql, '') AS sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'")
		.all() as { type: string; name: string; sql: string }[];
	return new Map(rows.map((row) => [`${row.type}:${row.name}`, row.sql]));
}

/**
 * The objects a step created, dropped or rewrote that its plan did not intend.
 *
 * The intent for each plan comes from `SHAPE_MARKERS`: the objects a version is
 * defined by, plus the baseline for a create. A `review`/`none` database may not
 * gain a single new object, which is what catches a `schema.sql` re-apply that
 * silently recreated tables its shape was missing.
 */
function unintendedObjects(
	before: Map<string, string>,
	after: Map<string, string>,
	plan: SchemaPlan,
): string[] {
	const allowed = intendedObjects(plan);
	const drift: string[] = [];

	if (plan.action === "create") {
		// Every object must belong to the baseline, but a create may still add
		// objects: they are exactly what is being created.
		for (const key of after.keys()) if (!allowed.has(key)) drift.push(key);
		return drift;
	}

	for (const [key, sql] of after) {
		if (!before.has(key)) {
			if (!allowed.has(key)) drift.push(key);
			continue;
		}
		if (before.get(key) !== sql && !allowed.has(key)) drift.push(key);
	}
	for (const key of before.keys()) if (!after.has(key) && !allowed.has(key)) drift.push(key);
	return drift;
}

/**
 * What a plan is allowed to create, drop or rewrite: every object of every shape
 * version up to this one, because a step can move between them. An unmarked
 * `none`/`review` file may only have its objects left alone — anything new is
 * drift.
 */
function intendedObjects(plan: SchemaPlan): Set<string> {
	const keys = new Set<string>();
	if (plan.action === "none") return keys;
	for (let version = 1; version <= SCHEMA_VERSION; version += 1) {
		const markers = SHAPE_MARKERS[version as 1 | 2];
		for (const marker of markers ?? []) {
			keys.add(`${marker.type}:${marker.name}`);
			for (const index of marker.indexes ?? []) keys.add(`index:${index}`);
		}
	}
	// The triggers the baseline drops and recreates on every apply: they are
	// `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`, so their text can change
	// without the shape changing.
	for (const name of TOUCH_TRIGGERS) keys.add(`trigger:${name}`);
	return keys;
}

/** The `*_touch` triggers `schema.sql` deliberately drops and recreates. */
const TOUCH_TRIGGERS = [
	"users_touch",
	"societies_touch",
	"execom_touch",
	"events_touch",
	"event_private_details_touch",
	"event_sessions_touch",
	"event_volunteers_touch",
	"coupons_touch",
	"registrations_touch",
	"payments_touch",
	"payment_attempts_touch",
	"payment_refunds_touch",
	"payment_webhook_events_touch",
	"event_waitlist_touch",
	"registration_cancellation_requests_touch",
	"certificate_templates_touch",
	"certificate_batches_touch",
	"certificates_touch",
	"organization_assignments_touch",
	"blogs_touch",
	"notification_outbox_touch",
	"community_profiles_touch",
];

/** Count every row in a table, for a rebuild that must not lose data. */
function countRows(database: Database, table: string): number {
	const row = database.prepare(`SELECT count(*) AS n FROM "${table}"`).get() as { n: number };
	return row.n;
}

/**
 * Rebuild `certificates` as v2.
 *
 * This is the SQLite-documented procedure, in the canonical order:
 * `PRAGMA foreign_keys=OFF` (done by `inStep`) → new table → copy → drop → rename
 * → recreate indexes → `foreign_key_check`.
 *
 * It is a rebuild rather than `ALTER TABLE` because v2 makes `registration_id`
 * nullable *and* adds a one-of CHECK; `ALTER TABLE` can neither drop a `NOT
 * NULL` nor add a table CHECK. The data is copied column for column, and the
 * row count is compared before the old table is dropped — a copy that silently
 * lost a row aborts the step.
 *
 * `schema.sql` is not used for the new table: it is `CREATE IF NOT EXISTS`, so
 * it would skip over the very table being replaced.
 */
function rebuildCertificatesV2(database: Database): void {
	const before = countRows(database, "certificates");
	database.exec(`
		CREATE TABLE certificates_v2 (
			id                      TEXT PRIMARY KEY,
			event_id                TEXT NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
			registration_id         TEXT REFERENCES registrations (id) ON DELETE RESTRICT,
			volunteer_id            TEXT REFERENCES event_volunteers (id) ON DELETE RESTRICT,
			batch_id                TEXT NOT NULL REFERENCES certificate_batches (id) ON DELETE RESTRICT,
			template_id             TEXT NOT NULL REFERENCES certificate_templates (id) ON DELETE RESTRICT,
			certificate_type        TEXT NOT NULL
			                        CHECK (certificate_type IN ('participation', 'completion', 'achievement',
			                                                    'appreciation', 'volunteer', 'speaker')),
			credential_id           TEXT NOT NULL,
			verification_token      TEXT NOT NULL,
			recipient_name_snapshot  TEXT NOT NULL,
			recipient_email_snapshot TEXT,
			event_title_snapshot    TEXT NOT NULL,
			issuer_name_snapshot    TEXT,
			issued_at               TEXT NOT NULL,
			status                  TEXT NOT NULL CHECK (status IN ('active', 'revoked', 'superseded')),
			revoked_at              TEXT,
			revoked_by              TEXT REFERENCES users (id) ON DELETE SET NULL,
			revocation_reason       TEXT,
			metadata_version        INTEGER NOT NULL DEFAULT 1 CHECK (metadata_version >= 1),
			supersedes              TEXT REFERENCES certificates (id) ON DELETE SET NULL,
			superseded_by           TEXT REFERENCES certificates (id) ON DELETE SET NULL,
			created_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
			updated_at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
			CHECK (registration_id IS NOT NULL OR volunteer_id IS NOT NULL)
		);
	`);
	database.exec(`
		INSERT INTO certificates_v2 (
			id, event_id, registration_id, volunteer_id, batch_id, template_id,
			certificate_type, credential_id, verification_token,
			recipient_name_snapshot, recipient_email_snapshot, event_title_snapshot,
			issuer_name_snapshot, issued_at, status, revoked_at, revoked_by,
			revocation_reason, metadata_version, supersedes, superseded_by,
			created_at, updated_at
		)
		SELECT
			id, event_id, registration_id, NULL, batch_id, template_id,
			certificate_type, credential_id, verification_token,
			recipient_name_snapshot, recipient_email_snapshot, event_title_snapshot,
			issuer_name_snapshot, issued_at, status, revoked_at, revoked_by,
			revocation_reason, metadata_version, supersedes, superseded_by,
			created_at, updated_at
		FROM certificates;
	`);
	const after = countRows(database, "certificates_v2");
	if (after !== before) {
		throw new SchemaMigrationError(
			"MIGRATION_VERIFY_FAILED",
			`certificates rebuild copied ${after} of ${before} rows; rolled back.`,
			{ before, after },
		);
	}

	database.exec(`
		DROP TABLE certificates;
		ALTER TABLE certificates_v2 RENAME TO certificates;
		DROP INDEX IF EXISTS certificates_credential_uq;
		DROP INDEX IF EXISTS certificates_token_uq;
		DROP INDEX IF EXISTS certificates_reg_batch_uq;
		DROP INDEX IF EXISTS certificates_volunteer_batch_uq;
		DROP INDEX IF EXISTS certificates_event_idx;
		CREATE UNIQUE INDEX certificates_credential_uq ON certificates (credential_id);
		CREATE UNIQUE INDEX certificates_token_uq ON certificates (verification_token);
		CREATE UNIQUE INDEX certificates_reg_batch_uq ON certificates (registration_id, batch_id);
		CREATE UNIQUE INDEX certificates_volunteer_batch_uq
			ON certificates (volunteer_id, batch_id) WHERE volunteer_id IS NOT NULL;
		CREATE INDEX certificates_event_idx ON certificates (event_id, status);
	`);
}

/**
 * Index names that must be dropped before a rebuild, from the shape definition
 * so there is one list to keep current.
 */
function rebuiltObjectIndexes(): string[] {
	const names = new Set<string>();
	for (const requirement of SHAPE_MARKERS[SCHEMA_VERSION]) {
		for (const index of requirement.indexes ?? []) names.add(index);
	}
	return [...names];
}

/** Drop the indexes a rebuild of their table invalidates. */
function dropRebuiltIndexes(database: Database): void {
	for (const name of rebuiltObjectIndexes()) database.exec(`DROP INDEX IF EXISTS "${name}"`);
}

/**
 * v1 → v2, in one transaction:
 *
 * - new tables and their index/trigger (`event_volunteers`);
 * - rebuild `certificates` (rebuild above) with the one-of CHECK;
 * - rebuild `notification_outbox` so `registration_id` is nullable and the
 *   certificate links exist;
 * - the v2-only indexes on `notification_outbox` and `event_volunteers`;
 * - the version marker last, so it only ever describes a committed shape.
 *
 * `sqlite/schema.sql` is then re-applied inside the same transaction, which is
 * a no-op for objects that now match and fills any purely additive object a
 * later build added to the file. That is why this step stays correct as the file
 * grows: the baseline remains the source of truth, and this function is only the
 * part a `CREATE IF NOT EXISTS` file cannot express.
 */
function migrateV1ToV2(database: Database, schemaSql: string): void {
	dropRebuiltIndexes(database);

	// event_volunteers comes from the baseline file: it is new in v2, so
	// `CREATE TABLE IF NOT EXISTS` really does create it.
	//
	// notification_outbox has to be rebuilt for the same reason certificates does:
	// v1 declared `registration_id ... NOT NULL`, and a volunteer certificate
	// email has no registration.
	const outboxBefore = countRows(database, "notification_outbox");
	database.exec(`
		CREATE TABLE notification_outbox_v2 (
			id                 TEXT PRIMARY KEY,
			registration_id    TEXT REFERENCES registrations (id) ON DELETE CASCADE,
			kind               TEXT NOT NULL CHECK (kind IN ('ticket', 'receipt', 'certificate')),
			status             TEXT NOT NULL CHECK (status IN ('pending', 'sending', 'sent', 'stubbed', 'failed')),
			recipient          TEXT NOT NULL,
			dedupe_key         TEXT NOT NULL,
			attempts           INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
			next_attempt_at    TEXT,
			last_attempt_at    TEXT,
			sent_at            TEXT,
			last_error         TEXT,
			certificate_id     TEXT,
			certificate_batch_id TEXT,
			created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ')),
			updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ'))
		);
	`);
	database.exec(`
		INSERT INTO notification_outbox_v2 (
			id, registration_id, kind, status, recipient, dedupe_key, attempts,
			next_attempt_at, last_attempt_at, sent_at, last_error, created_at, updated_at
		)
		SELECT
			id, registration_id, kind, status, recipient, dedupe_key, attempts,
			next_attempt_at, last_attempt_at, sent_at, last_error, created_at, updated_at
		FROM notification_outbox;
	`);
	const outboxAfter = countRows(database, "notification_outbox_v2");
	if (outboxAfter !== outboxBefore) {
		throw new SchemaMigrationError(
			"MIGRATION_VERIFY_FAILED",
			`notification_outbox rebuild copied ${outboxAfter} of ${outboxBefore} rows; rolled back.`,
			{ before: outboxBefore, after: outboxAfter },
		);
	}
	database.exec(`
		DROP TABLE notification_outbox;
		ALTER TABLE notification_outbox_v2 RENAME TO notification_outbox;
	`);

	rebuildCertificatesV2(database);

	// The rest of the v2 objects (event_volunteers, its index and trigger, the
	// outbox indexes, everything else purely additive) come from the baseline.
	database.exec(schemaSql);
	database.pragma(`user_version = ${SCHEMA_VERSION}`);
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export interface VerifyOptions {
	/** What to expect afterwards. `undefined` skips the version assertion. */
	expectVersion?: number;
}

/**
 * Prove a database is usable by this build. Read-only, so it is safe to run on
 * every boot and as a pre-flight on a backup before it is adopted.
 *
 * 1. `PRAGMA integrity_check` — the file is not corrupt.
 * 2. `PRAGMA foreign_key_check` — nothing dangles.
 * 3. `user_version` equals this build's version.
 * 4. The v2 shape markers are all present.
 *
 * Deliberately *not* "re-apply `schema.sql` and see if it creates anything": the
 * file drops and re-creates every `*_touch` trigger on each run by design, so
 * that test would always report a difference.
 */
export function verifyBaseline(database: Database, options: VerifyOptions = {}): void {
	const integrity = database.pragma("integrity_check", { simple: true }) as string;
	if (integrity !== "ok") {
		throw new SchemaMigrationError(
			"MIGRATION_VERIFY_FAILED",
			`integrity_check failed: ${integrity}`,
			{ integrity },
		);
	}
	const violations = database.pragma("foreign_key_check") as unknown[];
	if (violations.length > 0) {
		throw new SchemaMigrationError(
			"MIGRATION_VERIFY_FAILED",
			`foreign_key_check found ${violations.length} violation(s).`,
			violations.slice(0, 5),
		);
	}

	const inspection = inspect(database);
	if (options.expectVersion !== undefined && inspection.userVersion !== options.expectVersion) {
		throw new SchemaMigrationError(
			"MIGRATION_VERIFY_FAILED",
			`user_version is ${inspection.userVersion}, expected ${options.expectVersion}.`,
			{ userVersion: inspection.userVersion, expected: options.expectVersion },
		);
	}
	if (!satisfies(database, inspection, SCHEMA_VERSION)) {
		const missing = SHAPE_MARKERS[SCHEMA_VERSION].filter((requirement) => {
			if (requirement.type === "table") return !inspection.objects.has(`table:${requirement.name}`);
			return !inspection.objects.has(`${requirement.type}:${requirement.name}`);
		});
		throw new SchemaMigrationError(
			"DB_SHAPE_INVALID",
			`This database is not the v${SCHEMA_VERSION} shape this build needs.`,
			{ missing },
		);
	}
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

export interface MigrationResult {
	/** What was done. `none` means already current. */
	action: SchemaPlan["action"];
	/** Version before the run. */
	from: number;
	/** Version after the run — always {@link SCHEMA_VERSION} on success. */
	to: number;
	/** True when the version marker had to be inferred from the tables. */
	reviewed: boolean;
}

export interface MigrationOptions {
	/** Override `sqlite/schema.sql` (tests, and the cutover script). */
	schemaSql?: string;
	/** Log line per action. Off in tests; on at startup. Default false. */
	log?: (message: string) => void;
	/**
	 * Restrict the step to the objects the plan calls for.
	 *
	 * Production sets this: a database whose shape was not recognised must not
	 * silently gain a schema it never had. A write the plan did not intend rolls
	 * the whole step back with `DB_UNRECOGNISED`. Off everywhere else, where the
	 * point is to create whatever is missing.
	 */
	intended?: boolean;
}

/**
 * Bring an open database to {@link SCHEMA_VERSION}, or throw.
 *
 * Synchronous and self-contained so it can run against a connection that is not
 * the app singleton (the cutover script, the restore rehearsal, a pre-flight).
 * On any throw the database is left exactly as it was found.
 */
export function migrateSchema(
	database: Database,
	options: MigrationOptions = {},
): MigrationResult {
	const schemaSql = options.schemaSql ?? readSchemaSql();
	const plan = planSchema(database, schemaSql);
	const log = options.log ?? (() => undefined);
	const guard = options.intended ? plan : undefined;

	switch (plan.action) {
		case "none":
			log(`schema: up to date at v${SCHEMA_VERSION}`);
			return { action: "none", from: plan.userVersion, to: SCHEMA_VERSION, reviewed: false };

		case "create":
			inStep(
				database,
				"baseline",
				() => {
					database.exec(schemaSql);
					database.pragma(`user_version = ${SCHEMA_VERSION}`);
					verifyBaseline(database, { expectVersion: SCHEMA_VERSION });
				},
				guard,
			);
			log(`schema: fresh database created at v${SCHEMA_VERSION}`);
			return { action: "create", from: 0, to: SCHEMA_VERSION, reviewed: false };

		case "review":
			inStep(
				database,
				"review",
				() => {
					// A v1 shape needs the forward step; a v2 shape only needs its marker
					// back. `migrateV1ToV2` is safe on either: every object it touches is
					// `IF NOT EXISTS`, and the two rebuilds cannot run over v2 columns
					// because this is only reached when the shape says v1 — except the
					// marker-only case, which skips it.
					if (plan.from === 1) migrateV1ToV2(database, schemaSql);
					else database.pragma(`user_version = ${SCHEMA_VERSION}`);
					verifyBaseline(database, { expectVersion: SCHEMA_VERSION });
				},
				guard,
			);
			log(
				`schema: unmarked database reviewed as v${plan.from} and brought to v${SCHEMA_VERSION}` +
					" (the version marker was missing)",
			);
			return { action: "review", from: plan.from, to: SCHEMA_VERSION, reviewed: true };

		case "upgrade":
			inStep(
				database,
				"v1->v2",
				() => {
					try {
						migrateV1ToV2(database, schemaSql);
					} catch (err) {
						if (err instanceof SchemaMigrationError) throw err;
						throw new SchemaMigrationError(
							"MIGRATION_FAILED",
							`v1 -> v2 failed: ${err instanceof Error ? err.message : String(err)}. ` +
								"Rolled back; user_version is unchanged.",
							err,
						);
					}
					verifyBaseline(database, { expectVersion: SCHEMA_VERSION });
				},
				guard,
			);
			log(`schema: upgraded v1 -> v${SCHEMA_VERSION}`);
			return { action: "upgrade", from: 1, to: SCHEMA_VERSION, reviewed: false };
	}
}

/**
 * Pre-flight a file without changing it. For an operator, a restore rehearsal or
 * a test.
 *
 * Opens read-only, so a plan of `upgrade` says what a boot *would* do and never
 * writes it. `fileMustExist` turns a typo in `SQLITE_PATH` into a clear error
 * instead of an empty database at the wrong path.
 */
export function inspectDatabaseFile(
	path: string,
	options: { schemaSql?: string } = {},
): { plan: SchemaPlan; exists: boolean } {
	const absent = path === IN_MEMORY_PATH || !existsSync(path);
	const schemaSql = options.schemaSql ?? readSchemaSql();
	if (absent) return { plan: { action: "create", from: "fresh", userVersion: 0 }, exists: false };
	if (statSync(path).size === 0) {
		return { plan: { action: "create", from: "fresh", userVersion: 0 }, exists: true };
	}
	const database = new BetterSqlite3(path, { readonly: true, fileMustExist: true });
	try {
		return { plan: planSchema(database, schemaSql), exists: true };
	} finally {
		database.close();
	}
}

// ---------------------------------------------------------------------------
// Provisioning
// ---------------------------------------------------------------------------

/** Where a provisioning run may create its database. */
export type ProvisionLocation = "missing-file" | "empty-file" | "present-directory";

export interface ProvisionOptions {
	/** Override `sqlite/schema.sql` (tests). */
	schemaSql?: string;
	/** Log line per step. Off in tests; on in the script. Default false. */
	log?: (message: string) => void;
}

export interface ProvisionResult {
	/** The path that now holds a current database. */
	path: string;
	/** What was there before, so the operator can see what was accepted. */
	location: ProvisionLocation;
	/** The file's `user_version` afterwards. */
	version: number;
}

/**
 * Create a brand-new, current-version database at `path`. **Explicit only.**
 *
 * This is the one operation allowed to create production storage, and it is not
 * reachable from the application: it is called by `scripts/init-database.ts`,
 * which an operator runs after deliberately checking the mount. A normal boot
 * refuses a missing or empty production path (`DB_STORAGE_INVALID`) precisely so
 * that this decision is never made by accident.
 *
 * `CREATE` is `fileMustExist: false`-by-construction here and nowhere else: the
 * parent directory must already exist (the mount point), because a missing
 * directory is a missing mount, not a missing file. Anything already at the path
 * that is not an empty file is refused with `DB_STORAGE_INVALID`, so a mistyped
 * path cannot print a schema into a file of unknown contents.
 */
export function provisionDatabase(path: string, options: ProvisionOptions = {}): ProvisionResult {
	const log = options.log ?? (() => undefined);
	const schemaSql = options.schemaSql ?? readSchemaSql();

	if (path === IN_MEMORY_PATH) {
		throw new SchemaMigrationError(
			"DB_STORAGE_INVALID",
			`Cannot provision ":memory:": there is nothing to provision for a process-private database.`,
			{ path },
		);
	}

	const located = locateProvisionTarget(path);
	// `fileMustExist: false` *only* after the location was proven to be empty. The
	// boot path never sets it: `openGuarded` always passes `fileMustExist: true`.
	// This is the single place a database file is allowed to come into existence.
	const database = new BetterSqlite3(path, { fileMustExist: located === "present-directory" });
	try {
		if (located === "present-directory") {
			throw new SchemaMigrationError(
				"DB_STORAGE_INVALID",
				`Cannot provision over a file that already holds data: ${path}. Restore a backup with ` +
					"scripts/restore-backup.ts, or point SQLITE_PATH at an empty location.",
				{ path },
			);
		}
		const result = migrateSchema(database, {
			schemaSql,
			log,
			// A create is the only plan provisioning accepts, and its result is
			// verified against the full shape (`verifyBaseline`) before the commit. The
			// intended-writes guard is for a file that already holds a recognised
			// shape, so it is not armed here.
			intended: false,
		});
		log(`provisioned ${path} at v${result.to} (${located})`);
		return { path, location: located, version: result.to };
	} finally {
		database.close();
	}
}

/**
 * What is at `path` right now, for provisioning.
 *
 * A missing parent directory is reported as `missing-file` too; `provisionDatabase`
 * refuses it, because a missing directory is a missing mount and creating it is
 * exactly the bug this guard exists to prevent.
 */
function locateProvisionTarget(path: string): ProvisionLocation {
	if (!existsSync(path)) return "missing-file";
	if (statSync(path).isFile() && statSync(path).size === 0) return "empty-file";
	// A file with contents, or a directory: neither can be proven empty.
	return "present-directory";
}
