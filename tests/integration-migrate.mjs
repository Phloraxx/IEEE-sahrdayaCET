/**
 * Integration tests for `scripts/migrate-pb-to-sqlite.ts`.
 *
 * The staging rehearsal could not catch these: staging's PocketBase has **zero**
 * `attendance_records` rows, so the collection was never exercised. The CI
 * migration died on it with `NOT NULL constraint failed:
 * attendance_records.session_id`, and the cause turned out to be a missing
 * column alias rather than bad data.
 *
 * What is covered
 * ---------------
 * 1. **`session` maps to `session_id`.** The PocketBase field is `session` — a
 *    bare word — so the camelCase fallback looks for `sessionId` and finds
 *    nothing. Without the alias, *every* attendance row migrates with
 *    `session_id = NULL` and the collection fails outright. Same trap as
 *    `execom.order`, which the migration already documents.
 * 2. **A genuinely session-less row is skipped, not fatal.** PocketBase declares
 *    `session` as `required`, but the CI smoke suite writes rows that bypass
 *    validation. The target schema keeps `session_id NOT NULL`, so such a row is
 *    dropped and reported rather than filled with an invented value.
 * 3. **The count verification accounts for the drop.** A skipped row must not
 *    make `count attendance_records` fail — the check subtracts what was
 *    deliberately dropped.
 *
 * The fixture is a minimal PocketBase-shaped database: every collection table
 * the migration reads, but only the five rows an attendance record needs.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import Database from "better-sqlite3";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

let passed = 0;
const failures = [];

function check(ok, label, detail) {
	if (ok) {
		passed += 1;
		console.log(`  PASS  ${label}`);
	} else {
		failures.push({ label, detail });
		console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
	}
}

/**
 * Every PocketBase collection the migration reads.
 *
 * If a collection is added to `SPECS`, this list must grow with it or the
 * migration fails with "no such table" — which is the intended signal.
 */
const PB_COLLECTIONS = [
	"admin_audit_log",
	"attendance_records",
	"blogs",
	"certificate_batches",
	"certificate_templates",
	"certificates",
	"community_profiles",
	"coupons",
	"event_private_details",
	"event_sessions",
	"event_waitlist",
	"events",
	"execom",
	"notification_outbox",
	"organization_assignments",
	"payment_attempts",
	"payment_refunds",
	"payment_webhook_events",
	"payments",
	"registration_cancellation_requests",
	"registrations",
	"societies",
	"users",
];

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const SESSION_ID = "sess000000000001";
const EVENT_ID = "evnt000000000001";
const USER_ID = "user000000000001";
const REG_ID = "regi000000000001";
const ATT_WITH_SESSION = "attn000000000001";
const ATT_NO_SESSION = "attn000000000002";
const COLLECTION_ID = "coll000000000001";

function buildFixture(path) {
	const db = new Database(path);

	// Every collection table must exist: the migration does `SELECT *` on each.
	for (const collection of PB_COLLECTIONS) {
		db.exec(`CREATE TABLE "${collection}" (id TEXT PRIMARY KEY)`);
	}

	// PocketBase internals the migration reads.
	db.exec("CREATE TABLE _collections (id TEXT PRIMARY KEY, name TEXT)");
	db.exec(
		"CREATE TABLE _externalAuths (recordRef TEXT, providerId TEXT, provider TEXT)",
	);

	// `planFiles` resolves a storage directory back to a collection through this
	// table, so the events collection needs an id here or every stored file is
	// skipped as "record not migrated".
	db.prepare("INSERT INTO _collections (id, name) VALUES (?, ?)").run(COLLECTION_ID, "events");

	// The fixture carries every NOT NULL column of the tables it populates,
	// under PocketBase's real camelCase field names. A real PocketBase row always
	// has them; omitting one makes the migration insert an explicit NULL, which
	// overrides the column DEFAULT and fails the constraint for reasons that have
	// nothing to do with the behaviour under test.
	const addColumns = (table, columns) => {
		for (const column of columns) db.exec(`ALTER TABLE "${table}" ADD COLUMN "${column}" TEXT`);
	};

	addColumns("users", ["email", "emailVerified", "role", "created", "updated"]);
	addColumns("events", [
		"title", "slug", "date", "timeTbc", "baseFeePaise", "registrationOpen",
		"checkInEnabled", "isDeleted", "registeredCount", "checkedInCount",
		"collectIeeeMember", "approvalRevision", "allowSelfCancellation",
		"waitlistEnabled", "waitlistOfferMinutes", "waitlistReservedCount",
		"ieeeMemberDiscountPercent", "attendanceQualificationLocked",
		"attendanceQualificationVersion", "banner", "created", "updated",
	]);
	addColumns("event_sessions", [
		"event", "title", "startsAt", "sortOrder", "attendanceEnabled",
		"checkInEnabled", "requiredForCertificate", "attendanceWeight",
		"created", "updated",
	]);
	addColumns("registrations", [
		"event", "user", "checkedIn", "baseFeePaise", "discountPaise",
		"finalFeePaise", "ieeeMember", "created", "updated",
	]);

	// Multi-relation join sources: `societies.chairs` -> society_chairs and
	// `blogs.relation` -> blog_authors. Both tables stay empty here; the columns
	// only have to exist.
	addColumns("societies", ["chairs"]);
	addColumns("blogs", ["relation"]);

	// The attendance table keeps PocketBase's real field names: `session`,
	// `occurredAt`, `deviceId`, `idempotencyKey`. That naming is the point of the
	// test — `session` is the bare word the alias has to catch.
	db.exec("DROP TABLE attendance_records");
	db.exec(`
		CREATE TABLE attendance_records (
			id TEXT PRIMARY KEY,
			event TEXT,
			session TEXT,
			registration TEXT,
			type TEXT,
			occurredAt TEXT,
			operator TEXT,
			source TEXT,
			deviceId TEXT,
			idempotencyKey TEXT,
			note TEXT,
			created TEXT
		)
	`);

	const ts = "2026-11-01 10:00:00.000Z";

	const insert = (table, values) => {
		const columns = Object.keys(values);
		db.prepare(
			`INSERT INTO "${table}" (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
		).run(...Object.values(values));
	};

	insert("users", {
		id: USER_ID,
		email: "member@example.test",
		emailVerified: 1,
		role: "user",
		created: ts,
		updated: ts,
	});

	insert("events", {
		id: EVENT_ID,
		title: "Fixture Event",
		slug: "fixture-event",
		date: ts,
		timeTbc: 0,
		baseFeePaise: 0,
		registrationOpen: 1,
		checkInEnabled: 1,
		isDeleted: 0,
		registeredCount: 1,
		checkedInCount: 0,
		collectIeeeMember: 0,
		approvalRevision: 1,
		allowSelfCancellation: 0,
		waitlistEnabled: 0,
		waitlistOfferMinutes: 60,
		waitlistReservedCount: 0,
		ieeeMemberDiscountPercent: 0,
		attendanceQualificationLocked: 0,
		attendanceQualificationVersion: 1,
		banner: "banner.png",
		created: ts,
		updated: ts,
	});

	insert("event_sessions", {
		id: SESSION_ID,
		event: EVENT_ID,
		title: "Session One",
		startsAt: ts,
		sortOrder: 1,
		attendanceEnabled: 1,
		checkInEnabled: 1,
		requiredForCertificate: 0,
		attendanceWeight: 1,
		created: ts,
		updated: ts,
	});

	insert("registrations", {
		id: REG_ID,
		event: EVENT_ID,
		user: USER_ID,
		checkedIn: 0,
		baseFeePaise: 0,
		discountPaise: 0,
		finalFeePaise: 0,
		ieeeMember: 0,
		created: ts,
		updated: ts,
	});

	const attendance = {
		event: EVENT_ID,
		registration: REG_ID,
		type: "present",
		occurredAt: ts,
		source: "scanner",
		created: ts,
	};

	// The row that must survive: it has a session.
	insert("attendance_records", { id: ATT_WITH_SESSION, ...attendance, session: SESSION_ID });

	// The row that must be dropped and reported: PocketBase validation bypassed.
	insert("attendance_records", { id: ATT_NO_SESSION, ...attendance, session: "" });

	// One stored file, in PocketBase's `storage/{collectionId}/{recordId}/{name}`
	// layout, so the media checks have something real to count.
	const storageDir = join(path, "..", "storage", COLLECTION_ID, EVENT_ID);
	mkdirSync(storageDir, { recursive: true });
	writeFileSync(join(storageDir, "banner.png"), "fake-png-bytes");
	mkdirSync(join(path, "..", "uploads"), { recursive: true });

	db.close();
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

function runMigration(source, target, storage, uploads) {
	const tsx = resolve("node_modules/.bin/tsx");
	if (!existsSync(tsx)) throw new Error("tsx is not installed; run the package manager install first");

	try {
		const stdout = execFileSync(
			tsx,
			[
				"scripts/migrate-pb-to-sqlite.ts",
				"--source", source,
				"--target", target,
				"--storage", storage,
				"--uploads", uploads,
				"--apply",
			],
			{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
		);
		return { code: 0, stdout, stderr: "" };
	} catch (error) {
		return {
			code: error.status ?? 1,
			stdout: String(error.stdout ?? ""),
			stderr: String(error.stderr ?? ""),
		};
	}
}

function main() {
	const work = mkdtempSync(join(tmpdir(), "ieee-migrate-"));
	const source = join(work, "data.db");
	const target = join(work, "portal.db");

	try {
		buildFixture(source);

		console.log("\nattendance_records: session alias and skipped rows");
		const result = runMigration(
			source,
			target,
			join(work, "storage"),
			join(work, "uploads"),
		);

		check(
			result.code === 0,
			"migration completes",
			result.code === 0 ? "" : (result.stderr || result.stdout).split("\n").slice(-6).join(" | "),
		);

		if (result.code !== 0) {
			// Full output, so a failure here is diagnosable without re-running.
			console.log("--- migration stdout ---");
			console.log(result.stdout);
			console.log("--- migration stderr ---");
			console.log(result.stderr);
		}

		if (result.code !== 0) {
			// Nothing below can be meaningful if the run aborted.
			return;
		}

		check(
			/ALL CHECKS PASSED/.test(result.stdout),
			"verification passes",
			(result.stdout.match(/FAIL\s+\S+.*/g) ?? []).join(" | "),
		);

		check(
			/1 ROW\(S\) COULD NOT BE MIGRATED AND WERE DROPPED/.test(result.stdout),
			"the dropped row is reported loudly",
		);

		check(
			result.stdout.includes(ATT_NO_SESSION),
			"the report names the dropped row",
		);

		const db = new Database(target, { readonly: true });
		try {
			const rows = db.prepare("SELECT id, session_id FROM attendance_records").all();

			check(rows.length === 1, "exactly one attendance row migrated", `got ${rows.length}`);

			// The alias fix: a row with a session must carry it across, not NULL.
			const survived = rows[0];
			check(
				!!survived && survived.session_id !== null && survived.session_id !== "",
				"session_id is populated from the PocketBase `session` field",
				survived ? `session_id=${JSON.stringify(survived.session_id)}` : "no row",
			);

			check(
				!!survived && survived.session_id !== SESSION_ID,
				"session_id is remapped to a new id, not copied",
			);

			const sessionRow = db
				.prepare("SELECT id FROM event_sessions")
				.get();
			check(
				!!survived && !!sessionRow && survived.session_id === sessionRow.id,
				"session_id points at the migrated event_sessions row",
			);

			check(
				!rows.some((row) => row.id === ATT_NO_SESSION),
				"the session-less row is absent",
			);
		} finally {
			db.close();
		}
	} finally {
		rmSync(work, { recursive: true, force: true });
	}
}

main();

console.log("");
if (failures.length === 0) {
	console.log(`==== ${passed} passed, 0 failed ====`);
} else {
	console.log(`==== ${passed} passed, ${failures.length} failed ====`);
	for (const failure of failures) {
		console.log(`  - ${failure.label}${failure.detail ? `: ${failure.detail}` : ""}`);
	}
	process.exitCode = 1;
}
