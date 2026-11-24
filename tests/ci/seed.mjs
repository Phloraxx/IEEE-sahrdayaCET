/**
 * The release-gate seed: a synthetic SQLite database for the compiled app.
 *
 * Why a seed and not a copy of anything
 * ------------------------------------
 * The gate must never touch a real database, a backup, or a PocketBase volume.
 * This file therefore only ever writes to `<dir>/release-gate.sqlite` inside a
 * fresh temporary directory (or `RELEASE_GATE_DATA_DIR`), overwriting any
 * previous gate database but nothing else.
 *
 * What it builds
 * --------------
 * - the schema straight from `sqlite/schema.sql` (the only schema source of
 *   truth), applied inside a transaction and stamped with `PRAGMA user_version`
 *   the way `src/lib/db.server.ts` does it;
 * - two `@example.test` accounts: an `admin` and an ordinary `user`;
 * - one published event with an open internal registration window and one
 *   registration, so a public event page renders and capacity math has a row;
 * - one draft event that must stay invisible everywhere public;
 * - one society with a stable slug.
 *
 * No session is seeded here: the specs mint one themselves through
 * `tests/e2e/release-gate-support.ts`, which is also how the cookie encoding is
 * kept honest.
 *
 * Usage: `bun tests/ci/seed.mjs` — prints `RELEASE_GATE_SQLITE_PATH=<path>`.
 */

import Database from "better-sqlite3";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

/** The `PRAGMA user_version` this build expects (src/lib/db.server.ts). */
const SCHEMA_VERSION = 2;

const root = process.cwd();
const schemaFile = resolve(root, "sqlite", "schema.sql");

const dataDir =
	process.env.RELEASE_GATE_DATA_DIR?.trim() ||
	mkdtempSync(join(process.env.RELEASE_GATE_TMPDIR || tmpdir(), "release-gate-"));
const dbPath = join(dataDir, "release-gate.sqlite");

// Only the gate database is replaced. Refuse anything that is not named for it,
// so a mistyped override cannot delete an application database.
if (!/release-gate[^/\\]*\.sqlite$/.test(dbPath)) {
	throw new Error(
		`refusing to write ${dbPath}: the release-gate database must be named release-gate*.sqlite`,
	);
}

mkdirSync(dataDir, { recursive: true });
for (const suffix of ["", "-wal", "-shm"]) rmSync(`${dbPath}${suffix}`, { force: true });
mkdirSync(dirname(resolve(dataDir, "uploads")), { recursive: true });

const db = new Database(dbPath);
try {
	db.pragma("journal_mode = WAL");
	db.pragma("foreign_keys = ON");
	db.pragma("busy_timeout = 5000");

	const schema = readFileSync(schemaFile, "utf8");
	db.exec("BEGIN IMMEDIATE");
	try {
		db.exec(schema);
		db.pragma(`user_version = ${SCHEMA_VERSION}`);
		db.exec("COMMIT");
	} catch (error) {
		db.exec("ROLLBACK");
		throw error;
	}

	const now = new Date();
	const iso = (offsetDays = 0) =>
		new Date(now.getTime() + offsetDays * 24 * 60 * 60 * 1000).toISOString();

	const user = db.prepare(
		`INSERT INTO users (id, email, email_verified, name, display_name, google_sub, role, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
	);
	user.run(
		"ci-user-admin",
		"ci-admin@example.test",
		1,
		"CI Admin",
		"CI Admin",
		"release-gate-google-sub-admin",
		"admin",
		iso(),
		iso(),
	);
	user.run("ci-user-member", "ci-member@example.test", 1, "CI Member", "CI Member", null, "user", iso(), iso());

	db.prepare(
		`INSERT INTO societies (id, name, slug, bio, is_hidden, created_at, updated_at)
		 VALUES (?, ?, ?, ?, 0, ?, ?)`,
	).run(
		"ci-society",
		"CI Test Society",
		"ci-test-society",
		"Synthetic society seeded for the release gate.",
		iso(),
		iso(),
	);

	db.prepare(
		`INSERT INTO events
		   (id, title, slug, description, date, end_date, venue, location_address, status,
		    max_capacity, registered_count, check_in_enabled, registration_open, registration_mode,
		    registration_start, registration_deadline, society_id, base_fee_paise, price,
		    attendance_mode, allow_self_cancellation, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, 1, 0, 1, 'internal', ?, ?, ?, 0, 0, 'onsite', 0, ?, ?)`,
	).run(
		"ci-event-published",
		"CI Release Gate Demo Event",
		"ci-release-gate-demo",
		"<p>Synthetic published event used by the release gate.</p>",
		iso(14),
		iso(14),
		"CI Hall",
		"CI Campus",
		60,
		iso(-7),
		iso(7),
		"ci-society",
		iso(),
		iso(),
	);

	db.prepare(
		`INSERT INTO events
		   (id, title, slug, description, date, status, registration_open, registration_mode,
		    check_in_enabled, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, 'draft', 0, 'closed', 0, ?, ?)`,
	).run(
		"ci-event-draft",
		"CI Draft Event",
		"ci-draft-should-not-list",
		"<p>Must never be reachable publicly.</p>",
		iso(-30),
		iso(),
		iso(),
	);

	db.prepare(
		`INSERT INTO registrations
		   (id, user_id, event_id, user_name, user_email, payment_status, registration_status,
		    registration_source, base_fee_paise, discount_paise, final_fee_paise,
		    discount_source, created_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, 'not_required', 'confirmed', 'self_service', 0, 0, 0, 'none', ?, ?)`,
	).run(
		"ci-registration",
		"ci-user-member",
		"ci-event-published",
		"CI Member",
		"ci-member@example.test",
		iso(),
		iso(),
	);

	const integrity = db.pragma("integrity_check", { simple: true });
	if (integrity !== "ok") throw new Error(`seeded database fails integrity_check: ${String(integrity)}`);
	const violations = db.pragma("foreign_key_check");
	if (violations.length) throw new Error(`seeded database has ${violations.length} foreign-key violations`);
} finally {
	db.close();
}

// The path is the only output the caller needs; everything else is a log line.
console.log(`release-gate database: ${dbPath}`);
console.log(`RELEASE_GATE_SQLITE_PATH=${dbPath}`);
