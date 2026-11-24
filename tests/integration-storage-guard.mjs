/**
 * Regression tests for the production storage guard.
 *
 * The bug this covers: `openDatabase()` ran `mkdirSync(dirname(path))` and then
 * `new Database(path)` for every environment. better-sqlite3 creates a missing
 * file, and the mkdir created the missing mount directory, so a production
 * container whose `SQLITE_DATA_DIR` bind mount went missing booted cleanly onto
 * an empty portal instead of failing. A typo in `SQLITE_PATH` did the same one
 * directory over.
 *
 * What is asserted here, with synthetic files only:
 *
 * - production refuses a missing path, an empty file, `:memory:` and a file that
 *   is not a database — and refuses *without creating anything*;
 * - an unrecognised file keeps its bytes, its journal mode and its contents;
 * - a populated v2 database whose version marker is missing (the shape a
 *   PocketBase cutover leaves when it writes with its own code) is stamped, not
 *   treated as empty: its rows are still there afterwards;
 * - staging and test keep creating their database, so the deliberate reset and
 *   the synthetic suites are unchanged;
 * - provisioning is a separate, explicit action and refuses to run over
 *   something that already holds data.
 *
 * Run: `tsx tests/integration-storage-guard.mjs`
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

let passed = 0;
const failures = [];

function check(ok, label, detail) {
	if (ok) {
		passed += 1;
	} else {
		failures.push({ label, detail });
		console.log(`  FAIL ${label}${detail === undefined ? "" : `  (${JSON.stringify(detail)})`}`);
	}
}

function section(name) {
	console.log(`\n${name}`);
}

// Environment must exist before the data layer is imported.
const workDir = mkdtempSync(join(tmpdir(), "ieee-storage-guard-"));
process.env.APP_SECRET = "integration-test-secret-at-least-32-bytes-long";
process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
process.env.APP_URL = "http://localhost:5173";
process.env.ALLOWED_ORIGINS = "http://localhost:5173";
process.env.NODE_ENV = "test";

const { default: Database } = await import("better-sqlite3");
const { provisionDatabase, readSchemaSql, SchemaMigrationError } = await import(
	"../src/lib/db-migrate.server.ts"
);
const database = await import("../src/lib/db.server.ts");
const { resetEnvCache } = await import("../src/lib/env.server.ts");

/**
 * Open (or refuse) a database under one deployment environment.
 *
 * Both `DEPLOY_ENV` and `SQLITE_PATH` are set here rather than at call sites, so
 * no case can inherit the previous one's environment. Every call closes the
 * singleton afterwards, and `closeDatabase()` also clears the remembered
 * outcome: a failed open can leave a half-stamped singleton behind (the
 * connection opens, then the migration throws), and a case that did not close
 * would poison the next one. `resetEnvCache()` does the same for the cached
 * `EnvConfig` that carries `SQLITE_PATH`.
 */
async function boot(path, deploy) {
	database.closeDatabase();
	resetEnvCache();
	if (deploy === undefined) delete process.env.DEPLOY_ENV;
	else process.env.DEPLOY_ENV = deploy;
	process.env.SQLITE_PATH = path;
	try {
		return { readiness: await database.checkDatabase() };
	} catch (err) {
		return { error: err };
	} finally {
		database.closeDatabase();
	}
}

/** The boot's `SchemaMigrationError`, or `undefined` for a success or another throw. */
function storageError(result) {
	return result.error instanceof SchemaMigrationError ? result.error : undefined;
}

/** Bytes and mtime of a file, to prove a refusal did not write to it. */
function fingerprintOf(path) {
	return {
		exists: existsSync(path),
		bytes: existsSync(path) ? statSync(path).size : 0,
		content: existsSync(path) ? readFileSync(path) : undefined,
	};
}

function sameFingerprint(a, b) {
	return (
		a.exists === b.exists &&
		a.bytes === b.bytes &&
		String(a.content) === String(b.content)
	);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

try {
	section("production refuses storage it did not find populated");
	{
		// A path whose *parent* does not exist is the missing-mount case. Before
		// the guard, `mkdirSync` created that parent and `new Database()` created an
		// empty file, so the boot "succeeded".
		const missing = join(workDir, "missing-mount", "portal.db");
		const result = await boot(missing, "production");
		check(storageError(result)?.code === "DB_STORAGE_INVALID", "a missing path is refused", storageError(result)?.code);
		check(storageError(result)?.detail?.reason === "missing", "with reason `missing`", storageError(result)?.detail);
		check(!existsSync(join(workDir, "missing-mount")), "the guard did not create the directory");
		check(!existsSync(missing), "and did not create the database");

		// An empty file: a bare mount point, or a bare `touch`.
		const empty = join(workDir, "empty.db");
		writeFileSync(empty, "");
		{
			const emptyResult = await boot(empty, "production");
			check(storageError(emptyResult)?.detail?.reason === "empty", "an empty file is refused", storageError(emptyResult)?.detail);
			check(statSync(empty).size === 0, "and is left empty");
		}

		// A file that is not a database at all: bytes stay, nothing is appended.
		const foreign = join(workDir, "not-a-database.bin");
		const foreignBytes = Buffer.from("this is a backup of something else\n");
		writeFileSync(foreign, foreignBytes);
		const foreignBefore = fingerprintOf(foreign);
		{
			const foreignResult = await boot(foreign, "production");
			check(
				storageError(foreignResult)?.detail?.reason === "unrecognised",
				"a non-SQLite file is refused as unrecognised",
				storageError(foreignResult)?.detail,
			);
			check(sameFingerprint(foreignBefore, fingerprintOf(foreign)), "and its bytes are untouched");
		}

		// `:memory:` can never be persisted, so it can never be production storage.
		{
			const memoryResult = await boot(":memory:", "production");
			check(storageError(memoryResult)?.detail?.reason === "in_memory", ":memory: is refused in production", storageError(memoryResult)?.detail);
		}

		// A recognised-but-empty directory: an operator pointing SQLITE_DATA_DIR at
		// the mount instead of the file. Better-sqlite3 cannot open a directory, so
		// this must be a storage refusal rather than a driver crash.
		const directoryPath = join(workDir, "a-directory");
		mkdirSync(directoryPath);
		{
			const directoryResult = await boot(directoryPath, "production");
			check(
				storageError(directoryResult)?.code === "DB_STORAGE_INVALID",
				"a directory is refused as storage",
				storageError(directoryResult)?.code,
			);
		}

		// The failure is remembered: the process keeps refusing rather than
		// re-reading the schema on every statement.
		{
			database.closeDatabase();
			process.env.DEPLOY_ENV = "production";
			process.env.SQLITE_PATH = missing;
			const first = await database.checkDatabase().catch((err) => err);
			const second = await database.checkDatabase().catch((err) => err);
			check(first === second, "the refusal is remembered, not recomputed");
			database.closeDatabase();
		}
	}

	section("an unrecognised SQLite file is not repainted");
	{
		// A real SQLite file this app did not write — someone else's database at
		// the path. It is a valid SQLite file, so the header check passes and the
		// classifier is what refuses it. Nothing about the file may change.
		const other = join(workDir, "other-app.db");
		{
			const db = new Database(other);
			db.exec("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL);");
			db.prepare("INSERT INTO notes (body) VALUES (?)").run("keep me");
			// Deliberately a journal mode the app does not use, so a stray
			// `journal_mode = WAL` would be visible afterwards.
			db.pragma("journal_mode = DELETE");
			db.close();
		}
		const beforeBytes = fingerprintOf(other);
		const beforeMode = (() => {
			const db = new Database(other, { readonly: true });
			try {
				return db.pragma("journal_mode", { simple: true });
			} finally {
				db.close();
			}
		})();

		const result = await boot(other, "production");
		check(
			["DB_STORAGE_INVALID", "DB_UNRECOGNISED"].includes(storageError(result)?.code),
			"a foreign SQLite database is refused",
			storageError(result)?.code,
		);
		check(sameFingerprint(beforeBytes, fingerprintOf(other)), "and its bytes are untouched");

		const afterMode = (() => {
			const db = new Database(other, { readonly: true });
			try {
				return db.pragma("journal_mode", { simple: true });
			} finally {
				db.close();
			}
		})();
		check(afterMode === beforeMode, "journal_mode was not changed", { beforeMode, afterMode });

		const rows = (() => {
			const db = new Database(other, { readonly: true });
			try {
				return db.prepare("SELECT count(*) AS n FROM notes").get().n;
			} finally {
				db.close();
			}
		})();
		check(rows === 1, "the other application's rows are still there", rows);
		check(!existsSync(`${other}-wal`), "no WAL sidecar was created");
	}

	section("a populated v2 database with no version marker is stamped, not emptied");
	{
		// The shape `scripts/migrate-pb-to-sqlite.ts` leaves if it writes with its
		// own code and never bumps `user_version`: current tables, real rows,
		// marker 0. It must be recognised as a baseline to stamp — never as an
		// empty file to create, which would either fail or wipe it.
		const populated = join(workDir, "cutover-without-marker.db");
		provisionDatabase(populated);
		{
			const db = new Database(populated);
			db.prepare("INSERT INTO users (id, email, role) VALUES (?, ?, 'chair')").run(
				"11111111-1111-4111-8111-111111111111",
				"chair@example.test",
			);
			db.prepare("INSERT INTO users (id, email) VALUES (?, ?)").run(
				"22222222-2222-4222-8222-222222222222",
				"student@example.test",
			);
			db.pragma("user_version = 0");
			db.close();
		}
		const before = fingerprintOf(populated);

		const result = await boot(populated, "production");
		check(result.error === undefined, "a populated unmarked v2 database boots", storageError(result)?.code);
		check(result.readiness?.action === "review", "and is reported as a review", result.readiness?.action);
		check(result.readiness?.reviewed === true, "with `reviewed: true`", result.readiness);
		check(result.readiness?.to === 2, "landing on the current version", result.readiness?.to);
		check(result.readiness?.tables === 27, "with the full table set", result.readiness?.tables);

		const after = (() => {
			const db = new Database(populated, { readonly: true });
			try {
				return {
					version: db.pragma("user_version", { simple: true }),
					users: db.prepare("SELECT count(*) AS n FROM users").get().n,
					role: db.prepare("SELECT role FROM users WHERE id = ?").get("11111111-1111-4111-8111-111111111111").role,
					integrity: db.pragma("integrity_check", { simple: true }),
				};
			} finally {
				db.close();
			}
		})();
		check(after.version === 2, "the marker is now 2", after.version);
		check(after.users === 2, "both rows survived", after.users);
		check(after.role === "chair", "row contents are intact", after.role);
		check(after.integrity === "ok", "the file is intact", after.integrity);
		check(before.bytes > 0, "the fixture started populated", before.bytes);

		// And a second boot is a plain no-op — the marker is the only difference.
		const second = await boot(populated, "production");
		check(second.readiness?.action === "none", "a stamped database boots as current", second.readiness?.action);
		check(second.readiness?.reviewed === false, "and no longer counts as a review");
	}

	section("staging and test still create their database");
	{
		// The staging reset deletes the file and lets the app recreate it; local dev
		// and the integration suites do the same. This must keep working.
		for (const deploy of ["staging", "development", undefined]) {
			const label = deploy ?? "unset";
			const directory = join(workDir, `create-${label}`, "nested");
			const fresh = join(directory, "portal.db");
			const result = await boot(fresh, deploy);
			check(result.error === undefined, `${label}: no storage refusal`, storageError(result)?.code);
			check(existsSync(directory), `${label}: the directory was created`);
			check(existsSync(fresh), `${label}: the file was created`);
			check(result.readiness?.action === "create", `${label}: reported as create`, result.readiness?.action);
		}

		// An in-memory database is the unit-test default and is not production.
		const memoryResult = await boot(":memory:", "staging");
		check(memoryResult.error === undefined, "staging may use :memory:");

		// A second boot of a staging file is current, not a refusal.
		const staging = join(workDir, "create-staging", "nested", "portal.db");
		const again = await boot(staging, "staging");
		check(again.readiness?.action === "none", "the created database is current on the next boot");
	}

	section("provisioning is explicit and refuses to run over data");
	{
		const provisioned = join(workDir, "provisioned", "portal.db");
		mkdirSync(dirname(provisioned), { recursive: true });

		// Explicit provisioning creates a current database at a missing path.
		const created = provisionDatabase(provisioned, {
			schemaSql: readSchemaSql(),
			log: () => undefined,
		});
		check(created.version === 2, "provisioning creates a v2 database", created.version);
		check(created.location === "missing-file", "from a missing file", created.location);
		check(existsSync(provisioned), "the file exists afterwards");

		// Provisioning again over that populated file is refused, and the data
		// survives.
		{
			const db = new Database(provisioned);
			db.prepare("INSERT INTO users (id, email) VALUES (?, ?)").run(
				"33333333-3333-4333-8333-333333333333",
				"kept@example.test",
			);
			db.close();
		}
		let refused = null;
		try {
			provisionDatabase(provisioned, { log: () => undefined });
		} catch (err) {
			refused = err;
		}
		check(refused?.code === "DB_STORAGE_INVALID", "provisioning over data is refused", refused?.code);
		const kept = (() => {
			const db = new Database(provisioned, { readonly: true });
			try {
				return db.prepare("SELECT email FROM users WHERE id = ?").get("33333333-3333-4333-8333-333333333333")?.email;
			} finally {
				db.close();
			}
		})();
		check(kept === "kept@example.test", "the data is still there", kept);

		// A missing parent directory is a missing mount: provisioning does not
		// create one either.
		const unmounted = join(workDir, "no-such-mount", "portal.db");
		let missingRefused = null;
		try {
			provisionDatabase(unmounted, { log: () => undefined });
		} catch (err) {
			missingRefused = err;
		}
		check(missingRefused !== null, "provisioning does not create a missing mount directory");
		check(!existsSync(dirname(unmounted)), "and the directory is still absent");

		// An empty file is the one location provisioning accepts besides a missing
		// one — that is what makes a deliberate `touch` on a fresh volume usable.
		const touched = join(workDir, "touched.db");
		writeFileSync(touched, "");
		const fromEmpty = provisionDatabase(touched, { log: () => undefined });
		check(fromEmpty.location === "empty-file", "an empty file is provisioned", fromEmpty.location);

		// `:memory:` is never provisioned.
		let memoryRefused = null;
		try {
			provisionDatabase(":memory:", { log: () => undefined });
		} catch (err) {
			memoryRefused = err;
		}
		check(memoryRefused?.code === "DB_STORAGE_INVALID", "provisioning :memory: is refused", memoryRefused?.code);
	}
} finally {
	rmSync(workDir, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exitCode = 1;
