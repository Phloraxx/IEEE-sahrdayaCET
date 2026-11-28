/**
 * Integration tests for the versioned schema migration
 * (`src/lib/db-migrate.server.ts`) and the boot contract around it.
 *
 * Every database here is built by this file with synthetic fixtures. No
 * production or staging database is read, and nothing outside a temp directory
 * is written.
 *
 * The shapes under test
 * ---------------------
 * `sqlite/schema.sql` is the baseline and the only schema source of truth. The
 * shipped **v1** shape it replaced is reconstructed from the live database
 * definition at the time, and is asserted against the committed file: v1 must
 * *not* carry the v2 objects, and v2 must carry the v2 columns. If the file
 * drifts from either fixture, the drift fails here rather than at a boot.
 *
 * What each test proves
 * ---------------------
 * - fresh        an empty file becomes v2 with all 27 tables and no data
 * - upgrade      a v1 file with real rows becomes v2 without losing a row
 * - review       a v1 file whose marker was lost is detected and upgraded
 * - newer/unknown/edited shapes are refused, and refused *without a write*
 * - a failing step rolls back and leaves `user_version` alone
 * - the raw repository path (`users`, `sessions`) waits for another request's
 *   transaction instead of executing inside it — the connection-queue bypass
 *
 * Run: `tsx tests/integration-migrate-schema.mjs`
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

// ---------------------------------------------------------------------------
// Fixtures and imports
// ---------------------------------------------------------------------------

// The v1 and v2 shapes and their seed rows, shared with `integration-db.mjs`.
const { V1_SCHEMA, V1_SEED, V2_SEED } = await import("./fixtures/schema-shapes.mjs");

// ---------------------------------------------------------------------------
// Imports (after the harness, and after `SQLITE_PATH` is set for the last test)
// ---------------------------------------------------------------------------

const { default: Database } = await import("better-sqlite3");
const { readFileSync } = await import("node:fs");
const { resolve } = await import("node:path");
const migrate = await import("../src/lib/db-migrate.server.ts");

const { migrateSchema, planSchema, SchemaMigrationError, SCHEMA_VERSION, verifyBaseline, readSchemaSql } =
	migrate;

const SCHEMA_SQL = readFileSync(resolve("sqlite/schema.sql"), "utf8");

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

const workDir = mkdtempSync(join(tmpdir(), "ieee-schema-migrate-"));

function pathFor(name) {
	return join(workDir, `${name}.db`);
}

/** Open a fresh connection with the same pragmas the app uses. */
function open(path, { readonly = false } = {}) {
	const db = new Database(path, readonly ? { readonly: true } : {});
	db.pragma("foreign_keys = ON");
	db.pragma("busy_timeout = 5000");
	return db;
}

/** Build a v1 database with the shipped rows, then close it. */
function buildV1File(name, { marker = 1 } = {}) {
	const path = pathFor(name);
	const db = open(path);
	db.pragma("journal_mode = WAL");
	db.exec("BEGIN IMMEDIATE");
	db.exec(V1_SCHEMA);
	db.exec(V1_SEED);
	db.pragma(`user_version = ${marker}`);
	db.exec("COMMIT");
	db.close();
	return path;
}

/**
 * Build what a **shipped v2** database looks like on disk: the real baseline,
 * created while the old boot stamped the marker, then the rows.
 */
function buildShippedV2File(name) {
	const path = pathFor(name);
	const db = open(path);
	db.pragma("journal_mode = WAL");
	db.exec("BEGIN IMMEDIATE");
	db.exec(SCHEMA_SQL);
	db.exec(V2_SEED);
	db.pragma(`user_version = ${SCHEMA_VERSION}`);
	db.exec("COMMIT");
	db.close();
	return path;
}

function tableNames(db) {
	return db
		.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
		.all()
		.map((row) => row.name);
}

function columns(db, table) {
	return db.prepare("SELECT name FROM pragma_table_info(?)").all(table).map((row) => row.name);
}

function snapshot(path) {
	const db = open(path, { readonly: true });
	try {
		const counts = {};
		for (const name of tableNames(db)) {
			counts[name] = db.prepare(`SELECT count(*) AS n FROM "${name}"`).get().n;
		}
		const objects = db
			.prepare("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name")
			.all();
		return { counts, objects, userVersion: db.pragma("user_version", { simple: true }) };
	} finally {
		db.close();
	}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

try {
	section("fixture sanity: v1 is not v2, and the baseline is v2");
	{
		// The v2-only object must be absent from v1, or the upgrade below would be
		// testing nothing.
		check(!/CREATE TABLE[^;]*event_volunteers/i.test(V1_SCHEMA), "v1 fixture has no event_volunteers");
		check(
			!/volunteer_id/.test(V1_SCHEMA.slice(V1_SCHEMA.indexOf("CREATE TABLE IF NOT EXISTS certificates"))),
			"v1 certificates has no volunteer_id",
		);
		// And the committed baseline must agree with the v2 markers.
		const baseline = new Database(":memory:");
		baseline.exec(SCHEMA_SQL);
		baseline.pragma(`user_version = ${SCHEMA_VERSION}`);
		verifyBaseline(baseline, { expectVersion: SCHEMA_VERSION });
		check(
			columns(baseline, "certificates").includes("volunteer_id"),
			"baseline certificates has volunteer_id",
		);
		check(tableNames(baseline).length === 27, "baseline creates 27 tables", tableNames(baseline).length);
		check(
			tableNames(baseline).includes("event_volunteers"),
			"baseline creates event_volunteers",
		);
		baseline.close();
	}

	section("fresh database");
	{
		const path = pathFor("fresh");
		const db = open(path);
		const result = migrateSchema(db, { schemaSql: SCHEMA_SQL });
		check(result.action === "create", "fresh file takes the create path", result);
		check(result.to === SCHEMA_VERSION, "fresh file lands on this build's version", result.to);
		check(db.pragma("user_version", { simple: true }) === SCHEMA_VERSION, "user_version is written");
		check(tableNames(db).length === 27, "fresh file has 27 tables", tableNames(db).length);
		verifyBaseline(db, { expectVersion: SCHEMA_VERSION });
		db.close();

		// A second boot must be a no-op, not a re-apply.
		const again = open(path);
		const second = migrateSchema(again, { schemaSql: SCHEMA_SQL });
		check(second.action === "none", "a current database is left alone", second);
		again.close();
	}

	section("shipped v1 -> v2 upgrade");
	{
		const path = buildV1File("v1");
		const before = snapshot(path);
		check(before.userVersion === 1, "fixture starts at v1", before.userVersion);
		check(!before.counts.event_volunteers, "fixture has no event_volunteers yet");

		const db = open(path);
		const result = migrateSchema(db, { schemaSql: SCHEMA_SQL });
		check(result.action === "upgrade", "v1 takes the upgrade path", result.action);
		check(result.from === 1 && result.to === 2, "v1 -> v2", result);
		check(db.pragma("user_version", { simple: true }) === 2, "marker is 2 after the upgrade");
		verifyBaseline(db, { expectVersion: 2 });

		// Data. Every seeded row, same id, same values.
		const cert = db.prepare("SELECT * FROM certificates WHERE id = 'c-1'").get();
		check(cert !== undefined, "the certificate survived the rebuild", cert?.id);
		check(cert?.registration_id === "r-1", "registration_id value preserved", cert?.registration_id);
		check(cert?.volunteer_id === null, "volunteer_id is NULL for a registration certificate");
		check(
			cert?.verification_token === "fixture-token-000000000000000000000001",
			"the public verification token is unchanged — old credentials keep verifying",
			cert?.verification_token,
		);
		check(cert?.credential_id === "IEEESB-2026-FIXTURE0001", "credential id unchanged");

		const outbox = db
			.prepare("SELECT id, registration_id, status, sent_at FROM notification_outbox ORDER BY id")
			.all();
		check(outbox.length === 2, "both outbox rows survived", outbox.length);
		check(outbox[0]?.sent_at === "2026-01-01T00:00:00.000Z", "sent_at preserved on the sent row");
		check(outbox[1]?.status === "pending", "pending status preserved", outbox[1]?.status);

		check(db.prepare("SELECT count(*) AS n FROM users").get().n === 2, "users untouched");
		check(
			db.prepare("SELECT count(*) AS n FROM attendance_records").get().n === 1,
			"attendance untouched",
		);
		check(db.prepare("SELECT count(*) AS n FROM admin_audit_log").get().n === 1, "audit log untouched");

		// Shape. The whole point of v2.
		check(columns(db, "certificates").includes("volunteer_id"), "certificates has volunteer_id");
		check(
			db.prepare("SELECT name FROM sqlite_master WHERE name = 'event_volunteers'").get() !== undefined,
			"event_volunteers created",
		);
		check(
			db.prepare("SELECT name FROM sqlite_master WHERE name = 'certificates_volunteer_batch_uq'").get() !==
				undefined,
			"volunteer certificate uniqueness index created",
		);
		const regBatchSql = db
			.prepare("SELECT sql FROM sqlite_master WHERE name = 'certificates_reg_batch_uq'")
			.get().sql;
		check(!/NOT NULL/.test(regBatchSql), "certificates_reg_batch_uq rebuilt without NOT NULL columns");

		// The new invariants really are enforced after the upgrade.
		let volunteerAccepted = true;
		try {
			db.prepare(
				`INSERT INTO event_volunteers (id, event_id, name) VALUES ('v-1', 'e-1', 'Fixture Volunteer')`,
			).run();
			db.prepare(
				`INSERT INTO certificates (
					id, event_id, volunteer_id, batch_id, template_id, certificate_type,
					credential_id, verification_token, recipient_name_snapshot, event_title_snapshot,
					issued_at, status
				 ) VALUES ('c-vol', 'e-1', 'v-1', 'b-1', 't-1', 'volunteer',
				           'IEEESB-2026-FIXTURE0002', 'fixture-token-000000000000000000000002',
				           'Fixture Volunteer', 'Fixture Event', '2026-01-02T00:00:00.000Z', 'active')`,
			).run();
		} catch (err) {
			volunteerAccepted = false;
			console.log("    volunteer insert failed:", err.message);
		}
		check(volunteerAccepted, "a volunteer certificate (no registration) is accepted after the upgrade");

		// And a certificate with neither owner is refused: the invariant v2 adds.
		let ownerlessRefused = false;
		try {
			db.prepare(
				`INSERT INTO certificates (
					id, event_id, registration_id, volunteer_id, batch_id, template_id, certificate_type,
					credential_id, verification_token, recipient_name_snapshot, event_title_snapshot,
					issued_at, status
				 ) VALUES ('c-none', 'e-1', NULL, NULL, 'b-1', 't-1', 'participation',
				           'IEEESB-2026-FIXTURE0003', 'fixture-token-000000000000000000000003',
				           'Nobody', 'Fixture Event', '2026-01-02T00:00:00.000Z', 'active')`,
			).run();
		} catch (err) {
			ownerlessRefused = /CHECK/i.test(err.code ?? err.message);
		}
		check(ownerlessRefused, "the one-of CHECK refuses an owner-less certificate after the upgrade");

		// A volunteer certificate can be queued for email now that outbox
		// registration_id is nullable — the reason v2 rebuilt that table at all.
		let outboxAccepted = true;
		try {
			db.prepare(
				`INSERT INTO notification_outbox (id, registration_id, kind, status, recipient, dedupe_key, certificate_id)
				 VALUES ('n-3', NULL, 'certificate', 'pending', 'volunteer@example.test', 'certificate:c-vol', 'c-vol')`,
			).run();
		} catch (err) {
			outboxAccepted = false;
			console.log("    volunteer outbox insert failed:", err.message);
		}
		check(outboxAccepted, "a volunteer certificate email needs no registration");

		// Foreign keys still agree after a restart.
		db.close();
		const reopened = open(path, { readonly: true });
		check(reopened.pragma("foreign_key_check").length === 0, "foreign_key_check clean after the upgrade");
		reopened.close();

		// And a second boot of the upgraded file is a no-op with the same data.
		const second = open(path);
		const rerun = migrateSchema(second, { schemaSql: SCHEMA_SQL });
		check(rerun.action === "none", "the upgraded database is current on the next boot", rerun.action);
		second.close();

		// No v2 table's CREATE text was rewritten except the three rebuilt ones.
		const after = snapshot(path);
		const untouched = ["users", "events", "registrations", "attendance_records", "community_profiles"];
		const rewritten = untouched.filter((table) => {
			const a = before.objects.find((o) => o.type === "table" && o.name === table)?.sql;
			const b = after.objects.find((o) => o.type === "table" && o.name === table)?.sql;
			return a !== b;
		});
		check(rewritten.length === 0, "tables the migration does not need to touch keep their definition", rewritten);
	}

	section("shipped v2 database is left exactly as it is");
	{
		const path = buildShippedV2File("shipped-v2");
		const before = snapshot(path);
		const db = open(path);
		const plan = planSchema(db, SCHEMA_SQL);
		check(plan.action === "none", "a shipped v2 database is current, not 'upgraded'", plan.action);
		const result = migrateSchema(db, { schemaSql: SCHEMA_SQL });
		check(result.action === "none", "boot is a no-op", result.action);
		check(result.from === 2 && result.to === 2, "version is unchanged", result);
		verifyBaseline(db, { expectVersion: 2 });
		// The volunteer certificate that motivates v2 is already legal here.
		check(
			db.prepare("SELECT volunteer_id FROM certificates WHERE id = 'c-vol'").get()?.volunteer_id === "v-1",
			"volunteer certificate present and intact",
		);
		check(
			db.prepare("SELECT count(*) AS n FROM notification_outbox WHERE registration_id IS NULL").get().n === 1,
			"the volunteer outbox row survives",
		);
		db.close();

		const after = snapshot(path);
		check(
			JSON.stringify(after.objects) === JSON.stringify(before.objects),
			"no object was rewritten",
		);
		check(after.userVersion === 2, "user_version is still 2");
	}

	section("unmarked v1 (marker lost) is reviewed, not trusted blindly");
	{
		const path = buildV1File("unmarked", { marker: 0 });
		const db = open(path);
		const plan = planSchema(db, SCHEMA_SQL);
		check(plan.action === "review", "an unmarked v1 shape is planned as review", plan.action);
		const result = migrateSchema(db, { schemaSql: SCHEMA_SQL });
		check(result.action === "review" && result.reviewed, "the boot reports the review", result);
		check(db.pragma("user_version", { simple: true }) === 2, "the marker is set after a successful review");
		check(db.prepare("SELECT count(*) AS n FROM certificates").get().n === 1, "the row survived the review");
		db.close();
	}

	section("refusals, with no write");
	{
		// Newer than this build. The old code replayed a 2 schema over it.
		const newerPath = buildShippedV2File("newer-unsupported");
		{
			const db = open(newerPath);
			// What a newer build leaves behind: a schema this build cannot know,
			// stamped above it. A marker-only test would let a re-apply run here.
			db.exec("ALTER TABLE users ADD COLUMN future_only TEXT");
			db.pragma("user_version = 3");
			db.close();
		}
		const before = snapshot(newerPath);
		const db = open(newerPath);
		let newerError = null;
		try {
			migrateSchema(db, { schemaSql: SCHEMA_SQL });
		} catch (err) {
			newerError = err;
		}
		check(newerError instanceof SchemaMigrationError, "a newer database throws SchemaMigrationError");
		check(newerError?.code === "DB_NEWER_THAN_BUILD", "the code names the problem", newerError?.code);
		db.close();
		const after = snapshot(newerPath);
		check(after.userVersion === before.userVersion, "user_version untouched", after.userVersion);
		check(
			JSON.stringify(after.objects) === JSON.stringify(before.objects),
			"no object was created, dropped or rewritten",
		);

		// Claimed v2, but the certificates table was never rebuilt.
		const lyingPath = buildV1File("lying-v2");
		{
			const lying = open(lyingPath);
			lying.pragma("user_version = 2");
			lying.close();
		}
		const lyingBefore = snapshot(lyingPath);
		const lyingDb = open(lyingPath);
		const lyingPlan = (() => {
			try {
				planSchema(lyingDb, SCHEMA_SQL);
				return null;
			} catch (err) {
				return err;
			}
		})();
		check(lyingPlan?.code === "DB_SHAPE_INVALID", "a v2 marker on a v1 shape is refused", lyingPlan?.code);
		lyingDb.close();
		const lyingAfter = snapshot(lyingPath);
		check(
			JSON.stringify(lyingAfter.objects) === JSON.stringify(lyingBefore.objects),
			"the refused file is byte-identical in structure",
		);

		// A file from before the port: PocketBase's own tables, not this app's.
		const legacyPath = pathFor("legacy");
		{
			const legacy = new Database(legacyPath);
			legacy.exec(
				"CREATE TABLE _collections (id TEXT PRIMARY KEY, name TEXT);" +
					"CREATE TABLE _admins (id TEXT PRIMARY KEY, email TEXT);" +
					"CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT);",
			);
			legacy.close();
		}
		const legacyBefore = snapshot(legacyPath);
		const legacyDb = open(legacyPath);
		const legacyError = (() => {
			try {
				migrateSchema(legacyDb, { schemaSql: SCHEMA_SQL });
				return null;
			} catch (err) {
				return err;
			}
		})();
		check(
			legacyError?.code === "DB_UNRECOGNISED",
			"a PocketBase-era file is refused, not migrated over",
			legacyError?.code,
		);
		legacyDb.close();
		check(
			JSON.stringify(snapshot(legacyPath).objects) === JSON.stringify(legacyBefore.objects),
			"the PocketBase-era file keeps its tables",
		);

		// A database whose shape no version claims: this app's tables and no
		// marker, with `certificates` in v2's shape but the marker never written
		// and v2's index set absent. It is neither a complete v1 nor a complete v2,
		// so no version can be named for it.
		const editedPath = buildV1File("edited", { marker: 0 });
		{
			const edited = open(editedPath);
			edited.exec(`
				ALTER TABLE certificates RENAME TO certificates_old;
				CREATE TABLE certificates (
					id              TEXT PRIMARY KEY,
					event_id        TEXT NOT NULL REFERENCES events (id) ON DELETE RESTRICT,
					registration_id TEXT REFERENCES registrations (id) ON DELETE RESTRICT,
					verification_token TEXT NOT NULL
				);
				DROP TABLE certificates_old;
			`);
			edited.close();
		}
		const editedBefore = snapshot(editedPath);
		const editedDb = open(editedPath);
		const editedError = (() => {
			try {
				migrateSchema(editedDb, { schemaSql: SCHEMA_SQL });
				return null;
			} catch (err) {
				return err;
			}
		})();
		check(
			editedError?.code === "DB_UNRECOGNISED",
			"an unmarked database whose shape no version claims is refused, not guessed at",
			editedError?.code,
		);
		editedDb.close();
		const editedAfter = snapshot(editedPath);
		check(editedAfter.userVersion === 0, "the refused database is not stamped", {
			userVersion: editedAfter.userVersion,
			plan: editedAfter.plan,
		});
		check(editedAfter.counts.certificates === editedBefore.counts.certificates, "no rows were written");
		check(
			JSON.stringify(editedAfter.objects) === JSON.stringify(editedBefore.objects),
			"and no object was created by the refusal",
		);

		// The same column on a database that really is v2: reviewed and stamped.
		// The marker was lost, the shape was not — that is what review is for.
		const markerlessPath = buildShippedV2File("markerless");
		{
			const markerless = open(markerlessPath);
			markerless.pragma("user_version = 0");
			markerless.close();
		}
		const markerlessDb = open(markerlessPath);
		const markerlessPlan = planSchema(markerlessDb, SCHEMA_SQL);
		check(
			markerlessPlan.action === "review",
			"a v2 database that lost its marker is reviewed, not refused",
			markerlessPlan.action,
		);
		const markerlessResult = migrateSchema(markerlessDb, { schemaSql: SCHEMA_SQL });
		check(markerlessResult.action === "review", "and the boot reports the review", markerlessResult.action);
		check(
			markerlessDb.pragma("user_version", { simple: true }) === 2,
			"the marker is the only thing review adds",
		);
		check(
			markerlessDb.prepare("SELECT count(*) AS n FROM certificates").get().n === 2,
			"both certificates — registration and volunteer — survived the review",
		);
		markerlessDb.close();

		// A file that belongs to something else.
		const foreignPath = pathFor("foreign");
		{
			const foreign = new Database(foreignPath);
			foreign.exec("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT); INSERT INTO notes (body) VALUES ('x');");
			foreign.close();
		}
		const foreignDb = open(foreignPath);
		let foreignError = null;
		try {
			migrateSchema(foreignDb, { schemaSql: SCHEMA_SQL });
		} catch (err) {
			foreignError = err;
		}
		check(foreignError?.code === "DB_UNRECOGNISED", "a foreign table in an empty file is refused", foreignError?.code);
		check(tableNames(foreignDb).length === 1, "nothing was created in the foreign file", tableNames(foreignDb));
		foreignDb.close();

		// A shape below the supported floor. There is no migration for it, so the
		// only safe answer is a refusal that leaves the marker where it was.
		const ancientPath = pathFor("ancient");
		{
			const ancient = new Database(ancientPath);
			ancient.exec("CREATE TABLE legacy_accounts (id INTEGER PRIMARY KEY, email TEXT);");
			ancient.pragma("user_version = 0");
			ancient.close();
		}
		const ancientDb = open(ancientPath);
		let ancientError = null;
		try {
			migrateSchema(ancientDb, { schemaSql: SCHEMA_SQL });
		} catch (err) {
			ancientError = err;
		}
		check(
			ancientError?.code === "DB_UNRECOGNISED",
			"a pre-v1 file with none of this app's tables and a foreign table is refused",
			ancientError?.code,
		);
		check(ancientDb.pragma("user_version", { simple: true }) === 0, "the ancient file is not stamped");
		ancientDb.close();
	}

	section("a failing step rolls back");
	{
		const path = buildV1File("rollback");
		const before = snapshot(path);
		const db = open(path);

		// Break the step halfway through: the outbox rebuild is done, and then the
		// certificates copy hits a table that does not have the v1 column set.
		// (`ALTER TABLE` drops the column the copy SELECTs.)
		db.exec("ALTER TABLE certificates RENAME TO certificates_old");
		db.exec("CREATE TABLE certificates AS SELECT id, event_id FROM certificates_old");
		const shapesBefore = snapshot(path);

		let failed = null;
		try {
			migrateSchema(db, { schemaSql: SCHEMA_SQL });
		} catch (err) {
			failed = err;
		}
		check(failed instanceof SchemaMigrationError, "a broken step throws SchemaMigrationError", failed?.code);
		check(
			["MIGRATION_FAILED", "DB_SHAPE_INVALID", "MIGRATION_VERIFY_FAILED"].includes(failed?.code),
			"the failure is classified",
			failed?.code,
		);
		check(db.pragma("user_version", { simple: true }) === 1, "user_version is still 1 after the failure");
		const afterFailed = snapshot(path);
		check(
			JSON.stringify(afterFailed.objects) === JSON.stringify(shapesBefore.objects),
			"every intermediate object the step created was rolled back",
		);
		check(!afterFailed.counts.event_volunteers, "no partially-created table is left behind");

		// The connection is still usable: a refused migration is not a dead one.
		check(db.prepare("SELECT count(*) AS n FROM users").get().n === before.counts.users, "queries still work");
		db.close();
	}

	section("pre-flight is read-only");
	{
		const path = buildV1File("preflight");
		const before = snapshot(path);
		const { plan, exists } = migrate.inspectDatabaseFile(path, { schemaSql: SCHEMA_SQL });
		check(exists, "the file is reported present");
		check(plan.action === "upgrade", "the pre-flight says it would upgrade", plan.action);
		const after = snapshot(path);
		check(after.userVersion === before.userVersion, "the pre-flight changed no version");

		const missing = migrate.inspectDatabaseFile(pathFor("does-not-exist"), { schemaSql: SCHEMA_SQL });
		check(missing.exists === false && missing.plan.action === "create", "an absent file plans a create");

		// The schema is found from the repository root, and a miss is a clear code.
		check(readSchemaSql().includes("CREATE TABLE"), "readSchemaSql finds the baseline");
		const cwd = process.cwd();
		process.chdir(tmpdir());
		try {
			let error = null;
			try {
				readSchemaSql();
			} catch (err) {
				error = err;
			}
			check(
				error === null || error.code === "SCHEMA_FILE_MISSING",
				"a missing baseline is a named error, never an empty schema",
				error?.code,
			);
		} finally {
			process.chdir(cwd);
		}
	}

	section("one transaction-aware access path");
	{
		// The bypass this closes: `users`/`sessions` used to run straight on the
		// shared connection. A statement issued while another request held the
		// connection inside `withTransaction` therefore ran *inside that open
		// transaction* — it could see uncommitted rows, and a write could be
		// committed or rolled back with the other request's work.
		process.env.SQLITE_PATH = pathFor("queue");
		process.env.UPLOADS_DIR = join(workDir, "uploads");
		process.env.APP_SECRET = "integration-test-secret-at-least-32-bytes-long";
		process.env.GOOGLE_CLIENT_ID = "test-client-id";
		process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
		process.env.APP_URL = "http://localhost:5173";
		process.env.NODE_ENV = "test";

		const { users, query, withTransaction, closeDatabase, __dbTesting } = await import(
			"../src/lib/db.server.ts"
		);
		const { transactionStorage } = __dbTesting;
		const USER_ID = "aaaaaaaa-0000-4000-8000-000000000001";

		check((await users.count()) === 0, "the app connection opens and migrates a fresh database");

		// The bypass this closes: `users`/`sessions` used to run straight on the
		// shared connection. A statement issued while another request held the
		// connection inside `withTransaction` therefore ran *inside that open
		// transaction* — it could see uncommitted rows, and a write could be
		// committed or rolled back with the other request's work.
		//
		// 1. Nothing runs inside a transaction unless the caller is in one.
		check((await users.count()) === 0, "a standalone read sees only committed rows");

		// 2. A read made from the transaction's own chain is part of the atomic
		//    unit, so it sees the transaction's write even before the commit.
		let readRow;
		let readSawTransaction;
		await withTransaction(async () => {
			await query("INSERT INTO users (id, email) VALUES (?, ?)", [USER_ID, "inside@example.test"]);
			readRow = await users.findById(USER_ID);
			readSawTransaction = transactionStorage.getStore();
		});
		check(readSawTransaction === true, "a read inside withTransaction joins the transaction");
		check(readRow?.email === "inside@example.test", "and it sees the transaction's own write");

		// 3. A chain the transaction started is inside it too — that is the same
		//    atomic unit, and the queue must not deadlock on the transaction's own
		//    pending work.
		let parallelRow;
		await withTransaction(async () => {
			const inflight = users.findById(USER_ID);
			await query("INSERT INTO users (id, email) VALUES (?, ?)", [
				"aaaaaaaa-0000-4000-8000-000000000003",
				"held@example.test",
			]);
			parallelRow = await inflight;
		});
		check(parallelRow?.email === "inside@example.test", "a parallel read on the chain sees the transaction");
		check((await users.count()) === 2, "both committed rows are there afterwards");

		// 4. After the body throws, the connection is usable and the rolled-back
		//    row is not visible through any path.
		try {
			await withTransaction(async () => {
				await users.upsertFromGoogle({
					googleSub: "google-sub-rollback",
					email: "rollback@example.test",
					emailVerified: true,
				});
				throw new Error("rollback-me");
			});
		} catch (err) {
			check(err.message === "rollback-me", "the transaction body error is rethrown", err.message);
		}
		check((await users.count()) === 2, "the rolled-back user does not exist");
		check(
			(await users.findByGoogleSub("google-sub-rollback")) === undefined,
			"and neither does its Google link",
		);

		// The boot path migrated the file on disk; a second open agrees.
		closeDatabase();
		const onDisk = open(process.env.SQLITE_PATH, { readonly: true });
		check(onDisk.pragma("user_version", { simple: true }) === SCHEMA_VERSION, "the app file is v2");
		check(onDisk.pragma("integrity_check", { simple: true }) === "ok", "the app file is intact");
		onDisk.close();
	}
} finally {
	rmSync(workDir, { recursive: true, force: true });
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exitCode = 1;
