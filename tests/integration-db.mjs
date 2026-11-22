/**
 * Integration tests for the SQLite data layer.
 *
 * The unit tests mock the data layer, so they validate none of the SQL. This
 * suite runs against a real SQLite file: it applies `sqlite/schema.sql` to a
 * fresh temp database, seeds fixtures through the repositories, and exercises
 * every repository method plus the schema invariants.
 *
 * Self-contained: no network, no PocketBase, no external service. On success it
 * removes its temp directory; on failure it prints the database path so the
 * state can be inspected.
 *
 * The four better-sqlite3 trap classes, and where each is caught
 * -------------------------------------------------------------
 * 1. **Named parameters rejected with array binding** — every statement here
 *    uses positional `?`. A regression to named params fails the repository
 *    call outright (see "users.findById binds positionally").
 * 2. **`ON DELETE RESTRICT` raises SQLITE_CONSTRAINT_TRIGGER, not
 *    ..._FOREIGNKEY** — "isForeignKeyViolation recognises the RESTRICT trigger
 *    code" and "deleting a referenced row is refused, not a crash".
 * 3. **Booleans coerce to 0/1 and must be read with `=== 1`** — "boolean
 *    columns round-trip as 0/1" and "users.upsertFromGoogle stores
 *    email_verified as 1".
 * 4. **`RETURNING` rejects a table alias** — "insert ... returning yields the
 *    generated row" uses bare column names; an alias fails with SQLITE_ERROR.
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

async function checkThrows(fn, codePattern, label) {
	try {
		await fn();
		check(false, label, "expected a throw, got none");
	} catch (err) {
		check(codePattern.test(err.code ?? err.message ?? ""), label, err.code ?? err.message);
	}
}

async function checkResolves(fn, label, predicate) {
	try {
		check(predicate(await fn()), label);
	} catch (err) {
		check(false, label, `threw ${err.code ?? err.message}`);
	}
}

function section(name) {
	console.log(`\n${name}`);
}

// ---------------------------------------------------------------------------
// Environment must exist before the data layer is imported
// ---------------------------------------------------------------------------

const workDir = mkdtempSync(join(tmpdir(), "ieee-integration-"));
const dbPath = join(workDir, "test.db");

process.env.SQLITE_PATH = dbPath;
process.env.UPLOADS_DIR = join(workDir, "uploads");
process.env.APP_SECRET = "integration-test-secret-at-least-32-bytes-long";
process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
process.env.APP_URL = "http://localhost:5173";
process.env.PAYGATE_WEBHOOK_SECRET = "integration-webhook-secret-at-least-32-bytes";
process.env.PAYGATE_CLIENT_NAMESPACE = "local";
process.env.NODE_ENV = "test";

const { default: Database } = await import("better-sqlite3");
const { readFileSync } = await import("node:fs");
const { resolve } = await import("node:path");

// Apply the schema up front, exactly as `ensureSchema` would, so the db layer
// sees an initialised database (user_version = 1).
{
	const db = new Database(dbPath);
	db.pragma("journal_mode = WAL");
	db.pragma("foreign_keys = ON");
	db.exec("BEGIN IMMEDIATE");
	db.exec(readFileSync(resolve("sqlite/schema.sql"), "utf8"));
	db.pragma("user_version = 1");
	db.exec("COMMIT");
	db.close();
}

const db = await import("../src/lib/db.server.ts");
const { users, sessions, withTransaction, query, isForeignKeyViolation, isUniqueViolation, closeDatabase } =
	db;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

try {
	section("schema");
	{
		const raw = new Database(dbPath);
		const tables = raw
			.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
			.get().n;
		check(tables === 27, "schema creates 27 tables", tables);

		const integrity = raw.pragma("integrity_check", { simple: true });
		check(integrity === "ok", "integrity_check", integrity);

		const fk = raw.pragma("foreign_key_check");
		check(fk.length === 0, "foreign_key_check clean", fk.length);

		const version = raw.pragma("user_version", { simple: true });
		check(version === 1, "user_version is 1", version);
		raw.close();
	}

	section("users repository");
	{
		const created = await users.upsertFromGoogle({
			googleSub: "google-sub-1",
			email: "Alice@Example.com",
			emailVerified: true,
			name: "Alice",
			avatar: null,
		});
		check(typeof created.id === "string" && created.id.length === 36, "upsert creates a uuid id", created.id);
		check(created.email === "alice@example.com", "email is lowercased", created.email);
		// Trap 3: booleans are stored as 1, not true.
		check(created.email_verified === 1, "email_verified stored as 1", created.email_verified);
		check(created.role === "user", "new user gets the default role", created.role);
		check(created.google_sub === "google-sub-1", "google_sub stored", created.google_sub);

		// Trap 1: positional binding.
		const byId = await users.findById(created.id);
		check(byId?.id === created.id, "users.findById binds positionally", byId?.id);

		const bySub = await users.findByGoogleSub("google-sub-1");
		check(bySub?.id === created.id, "users.findByGoogleSub", bySub?.id);

		const byEmail = await users.findByEmail("ALICE@EXAMPLE.COM");
		check(byEmail?.id === created.id, "users.findByEmail is case-insensitive", byEmail?.id);

		// Second sign-in updates rather than duplicating.
		const again = await users.upsertFromGoogle({
			googleSub: "google-sub-1",
			email: "alice@example.com",
			emailVerified: true,
			name: "Alice Updated",
		});
		check(again.id === created.id, "upsert is idempotent by google_sub", again.id);
		check(again.name === "Alice Updated", "upsert refreshes the name", again.name);
		check(again.last_login_at !== null, "upsert records last_login_at", again.last_login_at);
		check((await users.count()) === 1, "no duplicate user created", await users.count());

		// A directory-only record (no google_sub) can be linked by email.
		const raw = new Database(dbPath);
		raw
			.prepare("INSERT INTO users (id, email, role) VALUES (?, ?, 'chair')")
			.run("11111111-1111-4111-8111-111111111111", "bob@example.com");
		raw.close();

		const linked = await users.upsertFromGoogle({
			googleSub: "google-sub-2",
			email: "bob@example.com",
			emailVerified: true,
			name: "Bob",
		});
		check(linked.id === "11111111-1111-4111-8111-111111111111", "unlinked record is linked by email", linked.id);
		check(linked.role === "chair", "linking preserves the existing role", linked.role);

		const unlinked = await users.listUnlinked();
		check(unlinked.length === 0, "listUnlinked is empty after linking", unlinked.length);

		// The unique index on lower(email) rejects a direct duplicate insert.
		// (`upsertFromGoogle` deliberately *links* by email instead of throwing,
		// which is the behaviour asserted above.)
		const dupDb = new Database(dbPath);
		let dupErr = null;
		try {
			dupDb
				.prepare("INSERT INTO users (id, email) VALUES (?, ?)")
				.run("99999999-9999-4999-8999-999999999998", "ALICE@example.com");
		} catch (err) {
			dupErr = err;
		}
		dupDb.close();
		check(isUniqueViolation(dupErr), "unique index rejects a duplicate email (case-insensitive)", dupErr?.code);
	}

	section("sessions repository");
	{
		const user = await users.findByEmail("alice@example.com");
		const token = "test-token-abc";
		const hash = db.hashToken ? db.hashToken(token) : null;

		// hashToken lives in the auth module, not db.server; compute it the same way.
		const { createHash } = await import("node:crypto");
		const tokenHash = hash ?? createHash("sha256").update(token).digest("hex");

		const session = await sessions.create({
			userId: user.id,
			token,
			tokenHash,
			ttlDays: 30,
			userAgent: "integration-test",
			ipHash: null,
		});
		check(typeof session.id === "string", "sessions.create returns a row", session.id);
		check(session.user_id === user.id, "session is bound to the user", session.user_id);
		check(session.token_hash === tokenHash, "only the hash is stored", session.token_hash);
		check(session.expires_at > session.created_at, "expiry is in the future", session.expires_at);

		const live = await sessions.findLiveByTokenHash(tokenHash);
		check(live?.user.id === user.id, "findLiveByTokenHash resolves the user", live?.user.id);

		const missing = await sessions.findLiveByTokenHash("0".repeat(64));
		check(missing === undefined, "unknown token resolves to nothing", missing);

		const newExpiry = await sessions.touch(session.id, 60);
		check(newExpiry > session.expires_at, "touch slides the expiry forward", newExpiry);

		check((await sessions.count()) === 1, "sessions.count", await sessions.count());

		const removed = await sessions.delete(session.id);
		check(removed === true, "sessions.delete removes the row", removed);
		check((await sessions.findLiveByTokenHash(tokenHash)) === undefined, "deleted session is gone");
	}

	section("transaction semantics");
	{
		const before = await users.count();

		await checkThrows(
			() =>
				withTransaction(async () => {
					await query("INSERT INTO users (id, email) VALUES (?, ?)", [
						"22222222-2222-4222-8222-222222222222",
						"rollback@example.com",
					]);
					throw new Error("boom");
				}),
			/boom/,
			"withTransaction rethrows the body error",
		);
		check((await users.count()) === before, "failed transaction rolls back", await users.count());

		await withTransaction(async () => {
			await query("INSERT INTO users (id, email) VALUES (?, ?)", [
				"33333333-3333-4333-8333-333333333333",
				"commit@example.com",
			]);
		});
		check((await users.count()) === before + 1, "committed transaction persists", await users.count());

		// Nested calls join the outer transaction rather than opening a second.
		await withTransaction(async () => {
			await withTransaction(async () => {
				await query("INSERT INTO users (id, email) VALUES (?, ?)", [
					"44444444-4444-4444-8444-444444444444",
					"nested@example.com",
				]);
			});
		});
		check((await users.count()) === before + 2, "nested withTransaction joins the outer one", await users.count());
	}

	section("foreign keys and constraints");
	{
		// Trap 2: ON DELETE RESTRICT surfaces as SQLITE_CONSTRAINT_TRIGGER.
		const raw = new Database(dbPath);
		raw.pragma("foreign_keys = ON");
		raw
			.prepare("INSERT INTO societies (id, name, slug) VALUES (?, ?, ?)")
			.run("55555555-5555-4555-8555-555555555555", "Test Society", "test-society");
		raw
			.prepare(
				"INSERT INTO events (id, title, slug, date, society_id) VALUES (?, ?, ?, ?, ?)",
			)
			.run(
				"66666666-6666-4666-8666-666666666666",
				"Test Event",
				"test-event",
				"2026-01-01T00:00:00.000Z",
				"55555555-5555-4555-8555-555555555555",
			);
		raw.close();

		let restrictError = null;
		try {
			await query("DELETE FROM societies WHERE id = ?", ["55555555-5555-4555-8555-555555555555"]);
		} catch (err) {
			restrictError = err;
		}
		check(restrictError !== null, "deleting a referenced society is refused");
		check(
			isForeignKeyViolation(restrictError),
			"isForeignKeyViolation recognises the RESTRICT trigger code",
			restrictError?.code,
		);

		// A dangling FK on INSERT reports FOREIGNKEY.
		let fkError = null;
		try {
			await query("INSERT INTO events (id, title, slug, date, society_id) VALUES (?, ?, ?, ?, ?)", [
				"77777777-7777-4777-8777-777777777777",
				"Orphan",
				"orphan",
				"2026-01-01T00:00:00.000Z",
				"99999999-9999-4999-8999-999999999999",
			]);
		} catch (err) {
			fkError = err;
		}
		check(isForeignKeyViolation(fkError), "dangling FK insert is a foreign-key violation", fkError?.code);

		// CHECK constraints.
		await checkThrows(
			() => query("INSERT INTO events (id, title, slug, date, status) VALUES (?, ?, ?, ?, ?)", [
				"88888888-8888-4888-8888-888888888888",
				"Bad status",
				"bad-status",
				"2026-01-01T00:00:00.000Z",
				"not-a-status",
			]),
			/SQLITE_CONSTRAINT/,
			"invalid enum is rejected by CHECK",
		);

		// Trap 3: a boolean column rejects a non-0/1 value.
		await checkThrows(
			() => query("INSERT INTO societies (id, name, slug, is_hidden) VALUES (?, ?, ?, ?)", [
				"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
				"Bad bool",
				"bad-bool",
				2,
			]),
			/SQLITE_CONSTRAINT/,
			"boolean CHECK rejects 2",
		);
	}

	section("partial unique index (registrations_active_uq)");
	{
		const raw = new Database(dbPath);
		raw.pragma("foreign_keys = ON");
		raw
			.prepare("INSERT INTO users (id, email) VALUES (?, ?)")
			.run("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "reg@example.com");
		const insertReg = raw.prepare(
			"INSERT INTO registrations (id, user_id, event_id, registration_status) VALUES (?, ?, ?, ?)",
		);
		insertReg.run(
			"cccccccc-cccc-4ccc-8ccc-cccccccccccc",
			"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
			"66666666-6666-4666-8666-666666666666",
			"confirmed",
		);

		let duplicate = null;
		try {
			insertReg.run(
				"dddddddd-dddd-4ddd-8ddd-dddddddddddd",
				"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
				"66666666-6666-4666-8666-666666666666",
				"pending",
			);
		} catch (err) {
			duplicate = err;
		}
		check(isUniqueViolation(duplicate), "second active registration is rejected", duplicate?.code);

		// A cancelled registration does not block a new one.
		raw
			.prepare("UPDATE registrations SET registration_status = 'cancelled' WHERE id = ?")
			.run("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
		let allowed = true;
		try {
			insertReg.run(
				"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
				"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
				"66666666-6666-4666-8666-666666666666",
				"confirmed",
			);
		} catch {
			allowed = false;
		}
		check(allowed, "a cancelled registration frees the seat", allowed);
		raw.close();
	}

	section("append-only attendance");
	{
		const raw = new Database(dbPath);
		raw.pragma("foreign_keys = ON");
		raw
			.prepare("INSERT INTO event_sessions (id, event_id, title, starts_at) VALUES (?, ?, ?, ?)")
			.run(
				"ffffffff-ffff-4fff-8fff-ffffffffffff",
				"66666666-6666-4666-8666-666666666666",
				"Session 1",
				"2026-01-01T10:00:00.000Z",
			);
		raw
			.prepare(
				"INSERT INTO attendance_records (id, event_id, session_id, registration_id, type, occurred_at, source) VALUES (?, ?, ?, ?, ?, ?, ?)",
			)
			.run(
				"12121212-1212-4212-8212-121212121212",
				"66666666-6666-4666-8666-666666666666",
				"ffffffff-ffff-4fff-8fff-ffffffffffff",
				"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
				"present",
				"2026-01-01T10:05:00.000Z",
				"manual",
			);

		let updateBlocked = false;
		try {
			raw.prepare("UPDATE attendance_records SET note = 'changed' WHERE id = ?").run(
				"12121212-1212-4212-8212-121212121212",
			);
		} catch {
			updateBlocked = true;
		}
		check(updateBlocked, "attendance_records rejects UPDATE", updateBlocked);

		let deleteBlocked = false;
		try {
			raw.prepare("DELETE FROM attendance_records WHERE id = ?").run(
				"12121212-1212-4212-8212-121212121212",
			);
		} catch {
			deleteBlocked = true;
		}
		check(deleteBlocked, "attendance_records rejects DELETE", deleteBlocked);
		raw.close();
	}

	section("updated_at trigger");
	{
		const raw = new Database(dbPath);
		const before = raw
			.prepare("SELECT updated_at FROM societies WHERE id = ?")
			.get("55555555-5555-4555-8555-555555555555");
		raw
			.prepare("UPDATE societies SET name = ? WHERE id = ?")
			.run("Renamed Society", "55555555-5555-4555-8555-555555555555");
		const after = raw
			.prepare("SELECT updated_at FROM societies WHERE id = ?")
			.get("55555555-5555-4555-8555-555555555555");
		check(after.updated_at >= before.updated_at, "update bumps updated_at", {
			before: before.updated_at,
			after: after.updated_at,
		});
		raw.close();
	}

	section("query() escape hatch");
	{
		const result = await query("SELECT count(*) AS n FROM users");
		check(Array.isArray(result.rows) && result.rows.length === 1, "query returns rows", result.rows.length);

		const write = await query("UPDATE users SET name = name WHERE id = ?", [
			"11111111-1111-4111-8111-111111111111",
		]);
		check(Array.isArray(write.rows) && write.rows.length === 0, "query on a write returns no rows");
	}
	section("public repos — visibility rules");
	{
		const raw = new Database(dbPath);
		raw.pragma("foreign_keys = ON");
		// Two societies: one visible, one hidden.
		raw.prepare("INSERT INTO societies (id,name,slug,is_hidden) VALUES (?,?,?,?)")
			.run("a0000000-0000-4000-8000-000000000001", "Visible Society", "visible-society", 0);
		raw.prepare("INSERT INTO societies (id,name,slug,is_hidden) VALUES (?,?,?,?)")
			.run("a0000000-0000-4000-8000-000000000002", "Hidden Society", "hidden-society", 1);

		const insEvent = raw.prepare(
			"INSERT INTO events (id,title,slug,date,status,is_deleted,society_id,banner,time_tbc,registration_open) VALUES (?,?,?,?,?,?,?,?,?,?)",
		);
		// published (visible), completed (visible), draft (hidden), deleted (hidden)
		insEvent.run("b0000000-0000-4000-8000-000000000001", "Published", "published-ev", "2026-03-01T00:00:00.000Z", "published", 0, "a0000000-0000-4000-8000-000000000001", "banner-a.jpg", 0, 1);
		insEvent.run("b0000000-0000-4000-8000-000000000002", "Completed", "completed-ev", "2026-02-01T00:00:00.000Z", "completed", 0, null, null, 0, 0);
		insEvent.run("b0000000-0000-4000-8000-000000000003", "Draft", "draft-ev", "2026-04-01T00:00:00.000Z", "draft", 0, "a0000000-0000-4000-8000-000000000001", null, 0, 0);
		insEvent.run("b0000000-0000-4000-8000-000000000004", "Deleted", "deleted-ev", "2026-05-01T00:00:00.000Z", "published", 1, "a0000000-0000-4000-8000-000000000001", null, 0, 0);

		// Execom with contact details that must not leak.
		raw.prepare("INSERT INTO execom (id,name,position,email,phone,sort_order,society_id) VALUES (?,?,?,?,?,?,?)")
			.run("d0000000-0000-4000-8000-000000000001", "Dir Person", "Chair", "private@example.com", "+910000000000", 1, "a0000000-0000-4000-8000-000000000001");
		raw.close();

		const repo = await import("../src/server/public/repo.server.ts");

		const events = await repo.listPublicEvents();
		const slugs = events.map((e) => e.slug).sort();
		check(slugs.includes("published-ev"), "listPublicEvents includes published", slugs);
		check(slugs.includes("completed-ev"), "listPublicEvents includes completed", slugs);
		check(!slugs.includes("draft-ev"), "listPublicEvents excludes draft", slugs);
		check(!slugs.includes("deleted-ev"), "listPublicEvents excludes deleted", slugs);

		const one = await repo.getPublicEventBySlug("published-ev");
		check(one?.slug === "published-ev", "getPublicEventBySlug finds a published event", one?.slug);
		check(one?.society_name === "Visible Society", "event joins its society", one?.society_name);
		check((await repo.getPublicEventBySlug("draft-ev")) === undefined, "getPublicEventBySlug hides drafts");
		check((await repo.getPublicEventBySlug("deleted-ev")) === undefined, "getPublicEventBySlug hides deleted");

		const societies = await repo.listPublicSocieties();
		const socSlugs = societies.map((s) => s.slug);
		check(socSlugs.includes("visible-society"), "listPublicSocieties includes visible", socSlugs);
		check(!socSlugs.includes("hidden-society"), "listPublicSocieties excludes hidden", socSlugs);

		// The public execom projection must not carry contact details.
		const directory = await repo.listExecom();
		const row = directory.find((m) => m.id === "d0000000-0000-4000-8000-000000000001");
		check(row !== undefined, "listExecom returns the row", row?.id);
		check(!("email" in (row ?? {})) || row?.email === undefined, "listExecom omits email", row?.email);
		check(!("phone" in (row ?? {})) || row?.phone === undefined, "listExecom omits phone", row?.phone);

		// Society-scoped directory *does* include contact details.
		const scoped = await repo.listExecomForSociety("a0000000-0000-4000-8000-000000000001");
		check(scoped[0]?.email === "private@example.com", "listExecomForSociety includes email", scoped[0]?.email);

		check((await repo.countExecom()) >= 1, "countExecom", await repo.countExecom());
		check((await repo.lookupTicket("TKT-NOPE")) === undefined, "lookupTicket misses unknown ids");
	}

	section("registration — create, replay, eligibility, capacity, cancel");
	{
		const raw = new Database(dbPath);
		raw.pragma("foreign_keys = ON");
		raw.prepare("INSERT INTO societies (id,name,slug,is_hidden) VALUES (?,?,?,0)")
			.run("e0000000-0000-4000-8000-000000000001", "Reg Society", "reg-society");

		// Capacity 3, published, internal, open, no deadline, self-cancel allowed.
		const insEvent = raw.prepare(
			`INSERT INTO events (id,title,slug,date,status,registration_mode,registration_open,max_capacity,society_id,base_fee_paise,eligible_semesters,allow_self_cancellation)
			 VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
		);
		insEvent.run("f0000000-0000-4000-8000-000000000001", "Capacity Event", "capacity-event",
			"2027-01-01T00:00:00.000Z", "published", "internal", 1, 3,
			"e0000000-0000-4000-8000-000000000001", 0, null, 1);
		// A second, untouched capacity-3 event for the concurrency race.
		insEvent.run("f0000000-0000-4000-8000-000000000004", "Race Event", "race-event",
			"2027-04-01T00:00:00.000Z", "published", "internal", 1, 3,
			"e0000000-0000-4000-8000-000000000001", 0, null, 1);
		// Restricted to S5, for the eligibility test.
		insEvent.run("f0000000-0000-4000-8000-000000000002", "S5 Only", "s5-only",
			"2027-02-01T00:00:00.000Z", "published", "internal", 1, 50,
			"e0000000-0000-4000-8000-000000000001", 0, JSON.stringify(["S5"]), 1);
		// Paid event for pricing.
		insEvent.run("f0000000-0000-4000-8000-000000000003", "Paid Event", "paid-event",
			"2027-03-01T00:00:00.000Z", "published", "internal", 1, 50,
			"e0000000-0000-4000-8000-000000000001", 50000, null, 1);

		const users = [];
		for (let i = 0; i < 10; i += 1) {
			const id = `a1000000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`;
			raw.prepare("INSERT INTO users (id,email) VALUES (?,?)").run(id, `reg${i}@example.com`);
			users.push(id);
		}
		raw.close();

		const { createRegistration } = await import("../src/server/registration/create.ts");
		const { cancelRegistration } = await import("../src/server/registration/cancel.ts");
		const { listMyEvents, getMyRegistration } = await import("../src/server/registration/status.ts");

		// --- create ---
		const first = await createRegistration({
			eventId: "f0000000-0000-4000-8000-000000000001",
			userId: users[0],
			formResponses: { name: "User Zero", semester: "S5" },
		});
		check(first.ok === true && first.status === 201, "create returns 201", first);
		check(first.ok && first.reused === false, "first create is not a replay", first.reused);
		check(first.ok && first.ticketId.startsWith("TKT-"), "free registration issues a ticket", first.ticketId);
		check(first.ok && first.registrationStatus === "confirmed", "free registration is confirmed", first.registrationStatus);

		// --- idempotent replay ---
		const replay = await createRegistration({
			eventId: "f0000000-0000-4000-8000-000000000001",
			userId: users[0],
			formResponses: { name: "User Zero", semester: "S5" },
		});
		check(replay.ok === true && replay.reused === true, "identical retry is a replay", replay);
		check(replay.ok && replay.registrationId === first.registrationId, "replay returns the same row", replay.registrationId);

		const conflicting = await createRegistration({
			eventId: "f0000000-0000-4000-8000-000000000001",
			userId: users[0],
			formResponses: { name: "Different Name" },
		});
		check(conflicting.ok === false && conflicting.status === 409, "changed answers are rejected", conflicting);

		// --- eligibility ---
		const ineligible = await createRegistration({
			eventId: "f0000000-0000-4000-8000-000000000002",
			userId: users[1],
			formResponses: { semester: "S3" },
		});
		check(ineligible.ok === false && ineligible.status === 400, "wrong semester is rejected", ineligible);
		check(ineligible.ok === false && ineligible.code === "SEMESTER_NOT_ELIGIBLE", "eligibility code", ineligible.code);

		const eligible = await createRegistration({
			eventId: "f0000000-0000-4000-8000-000000000002",
			userId: users[1],
			formResponses: { semester: "S5" },
		});
		check(eligible.ok === true, "matching semester is accepted", eligible);

		const missingSemester = await createRegistration({
			eventId: "f0000000-0000-4000-8000-000000000002",
			userId: users[2],
			formResponses: {},
		});
		check(missingSemester.ok === false && missingSemester.code === "SEMESTER_REQUIRED", "missing semester is rejected", missingSemester);

		// --- capacity under concurrency ---
		// 10 distinct users hammer an untouched 3-seat event in parallel.
		const attempts = await Promise.all(
			users.map((userId) =>
				createRegistration({
					eventId: "f0000000-0000-4000-8000-000000000004",
					userId,
					formResponses: { name: "Racer", semester: "S5" },
				}).catch((err) => ({ ok: false, status: 500, code: "THREW", error: String(err) })),
			),
		);
		const won = attempts.filter((r) => r.ok === true);
		const full = attempts.filter((r) => r.ok === false && r.code === "EVENT_FULL");
		check(won.length <= 3, "capacity is never oversold under concurrency", `${won.length} succeeded`);
		check(won.length === 3, "exactly capacity registrations succeed", won.length);
		check(full.length === 7, "the rest are refused with EVENT_FULL", full.length);

		const seated = new Database(dbPath);
		const activeCount = seated.prepare(
			"SELECT count(*) AS n FROM registrations WHERE event_id = ? AND registration_status <> 'cancelled'",
		).get("f0000000-0000-4000-8000-000000000004").n;
		const counter = seated.prepare("SELECT registered_count AS n FROM events WHERE id = ?")
			.get("f0000000-0000-4000-8000-000000000004").n;
		seated.close();
		check(activeCount === 3, "database holds exactly capacity active registrations", activeCount);
		check(counter === activeCount, "registered_count matches the live rows", { counter, activeCount });

		// --- cancel releases a seat ---
		// Pair each successful attempt with the user who made it.
		const winners = attempts
			.map((result, index) => ({ result, userId: users[index] }))
			.filter((entry) => entry.result.ok === true);
		const winner = winners[0];

		const cancelled = await cancelRegistration({
			registrationId: winner.result.registrationId,
			userId: winner.userId,
		});
		check(cancelled.ok === true && cancelled.action === "cancelled", "cancel succeeds", cancelled);

		const afterCancel = new Database(dbPath);
		const afterCount = afterCancel.prepare(
			"SELECT count(*) AS n FROM registrations WHERE event_id = ? AND registration_status <> 'cancelled'",
		).get("f0000000-0000-4000-8000-000000000004").n;
		afterCancel.close();
		check(afterCount === 2, "cancel releases the seat", afterCount);

		// Cancelling again is idempotent, not a conflict.
		const again = await cancelRegistration({
			registrationId: winner.result.registrationId,
			userId: winner.userId,
		});
		check(again.ok === true && again.action === "cancelled", "cancel is idempotent", again);

		// --- IDOR: another user's registration is not found ---
		const foreign = await cancelRegistration({
			registrationId: winner.result.registrationId,
			userId: users[9],
		});
		check(foreign.ok === false && foreign.status === 404, "cancelling someone else's registration is 404", foreign);

		// --- my-events is scoped to the session user ---
		const mine = await listMyEvents(users[0]);
		check(mine.items.length >= 1, "my-events returns the user's registrations", mine.items.length);
		check(
			mine.items.every((item) => item.registration.id !== ""),
			"my-events items carry registration ids",
		);

		// Response-shape regression: the SQLite port dropped attendance,
		// certificates and privateAccess, which crashed /my-events with
		// "Cannot read properties of undefined (reading 'mode')" in
		// attendanceLabel. Every item must carry the full shape.
		check(
			mine.items.every((item) => item.attendance && typeof item.attendance === "object"),
			"my-events items carry an attendance object",
			mine.items.map((item) => item.attendance),
		);
		check(
			mine.items.every(
				(item) => item.attendance.mode === "legacy" || item.attendance.mode === "sessions",
			),
			"attendance.mode is 'legacy' or 'sessions'",
			mine.items.map((item) => item.attendance?.mode),
		);
		check(
			mine.items.every((item) => Array.isArray(item.attendance.sessions)),
			"attendance.sessions is always an array",
		);
		check(
			mine.items.every((item) => typeof item.attendance.checkedIn === "boolean"),
			"attendance.checkedIn is a boolean",
		);
		check(
			mine.items.every((item) => typeof item.attendance.attendedSessions === "number"),
			"attendance.attendedSessions is a number",
		);
		check(
			mine.items.every((item) => Array.isArray(item.certificates)),
			"my-events items carry a certificates array",
			mine.items.map((item) => item.certificates),
		);
		check(
			mine.items.every((item) => item.privateAccess === null || typeof item.privateAccess === "object"),
			"privateAccess is null or an object",
			mine.items.map((item) => item.privateAccess),
		);
		check(
			mine.items.every((item) => item.cancellation && typeof item.cancellation === "object"),
			"my-events items carry a cancellation object",
		);
		check(
			mine.items.every((item) => "request" in item.cancellation),
			"cancellation.request is present (null when none)",
		);

		const status = await getMyRegistration("f0000000-0000-4000-8000-000000000001", users[0]);
		check(status?.found === true, "my-registration finds the row", status?.found);

		const nobody = await getMyRegistration("f0000000-0000-4000-8000-000000000003", users[0]);
		check(nobody?.found === false, "my-registration reports not-found for another event", nobody?.found);

		// --- paid event: pricing snapshot ---
		const paid = await createRegistration({
			eventId: "f0000000-0000-4000-8000-000000000003",
			userId: users[3],
			formResponses: { name: "Payer" },
		});
		check(paid.ok === true && paid.paymentRequired === true, "paid event requires payment", paid);
		check(paid.ok && paid.registrationStatus === "pending", "paid registration starts pending", paid.registrationStatus);
		check(paid.ok && paid.amount === 500, "amount is the base fee in rupees", paid.amount);
	}

	section("registration — waitlist promotion and offer expiry");
	{
		const raw = new Database(dbPath);
		raw.pragma("foreign_keys = ON");
		raw.prepare("INSERT INTO societies (id,name,slug,is_hidden) VALUES (?,?,?,0)")
			.run("e1000000-0000-4000-8000-000000000001", "Waitlist Society", "waitlist-society");

		const insEvent = raw.prepare(
			`INSERT INTO events (id,title,slug,date,status,registration_mode,registration_open,max_capacity,society_id,base_fee_paise,allow_self_cancellation,waitlist_enabled,waitlist_offer_minutes)
			 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
		);
		// Capacity 1, waitlist on, 60-minute offers.
		insEvent.run("e2000000-0000-4000-8000-000000000001", "Waitlist Event", "waitlist-event",
			"2027-07-01T00:00:00.000Z", "published", "internal", 1, 1,
			"e1000000-0000-4000-8000-000000000001", 0, 1, 1, 60);
		// Capacity 1, waitlist off — used for the expiry path.
		insEvent.run("e2000000-0000-4000-8000-000000000002", "Expiry Event", "expiry-event",
			"2027-08-01T00:00:00.000Z", "published", "internal", 1, 1,
			"e1000000-0000-4000-8000-000000000001", 0, 1, 1, 60);

		const wlUsers = [];
		for (let i = 0; i < 3; i += 1) {
			const id = `e3000000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`;
			raw.prepare("INSERT INTO users (id,email) VALUES (?,?)").run(id, `wl${i}@example.com`);
			wlUsers.push(id);
		}
		raw.close();

		const { createRegistration } = await import("../src/server/registration/create.ts");
		const { cancelRegistration } = await import("../src/server/registration/cancel.ts");
		const { reconcileEventWaitlist } = await import("../src/server/registration/waitlist.ts");

		const EVENT = "e2000000-0000-4000-8000-000000000001";
		const EXPIRY_EVENT = "e2000000-0000-4000-8000-000000000002";

		// Fill the single seat.
		const seat = await createRegistration({
			eventId: EVENT, userId: wlUsers[0], formResponses: { name: "Seat Holder" },
		});
		check(seat.ok === true, "seat holder registers", seat);

		// The second user is refused and would be offered the waitlist.
		const refused = await createRegistration({
			eventId: EVENT, userId: wlUsers[1], formResponses: { name: "Waitlisted" },
		});
		check(refused.ok === false && refused.code === "EVENT_FULL", "second user is refused when full", refused);

		// Simulate the join (the waitlist command lands in phase 5).
		const wl = new Database(dbPath);
		wl.pragma("foreign_keys = ON");
		wl.prepare(
			`INSERT INTO event_waitlist (id,event_id,user_id,status,joined_at) VALUES (?,?,?,?,?)`,
		).run("e4000000-0000-4000-8000-000000000001", EVENT, wlUsers[1], "waiting", new Date().toISOString());
		wl.close();

		// Cancel the seat holder: the seat must be offered to the waiting user.
		const cancelled = await cancelRegistration({
			registrationId: seat.registrationId, userId: wlUsers[0],
		});
		check(cancelled.ok === true, "seat holder cancels", cancelled);

		const afterPromote = new Database(dbPath);
		const entry = afterPromote.prepare(
			"SELECT status, offer_expires_at FROM event_waitlist WHERE id = ?",
		).get("e4000000-0000-4000-8000-000000000001");
		const reserved = afterPromote.prepare(
			"SELECT waitlist_reserved_count AS n FROM events WHERE id = ?",
		).get(EVENT).n;
		afterPromote.close();

		check(entry?.status === "offered", "cancel promotes the waitlisted user to an offer", entry?.status);
		check(typeof entry?.offer_expires_at === "string" && entry.offer_expires_at.length > 0,
			"the offer carries an expiry", entry?.offer_expires_at);
		check(reserved === 1, "the offer is counted as reserved", reserved);

		// The offered user may take the seat; a third party may not steal it.
		const thief = await createRegistration({
			eventId: EVENT, userId: wlUsers[2], formResponses: { name: "Thief" },
		});
		check(thief.ok === false, "a third party cannot steal an offered seat", thief);

		const accepted = await createRegistration({
			eventId: EVENT, userId: wlUsers[1], formResponses: { name: "Waitlisted" },
		});
		check(accepted.ok === true, "the offered user can take the seat", accepted);

		const afterAccept = new Database(dbPath);
		const acceptedEntry = afterAccept.prepare(
			"SELECT status, accepted_registration FROM event_waitlist WHERE id = ?",
		).get("e4000000-0000-4000-8000-000000000001");
		afterAccept.close();
		check(acceptedEntry?.status === "accepted", "the offer is marked accepted", acceptedEntry?.status);
		check(acceptedEntry?.accepted_registration === accepted.registrationId,
			"the offer records which registration consumed it", acceptedEntry?.accepted_registration);

		// --- offer expiry releases the seat ---
		const expSeat = await createRegistration({
			eventId: EXPIRY_EVENT, userId: wlUsers[0], formResponses: { name: "Expiry Holder" },
		});
		check(expSeat.ok === true, "expiry event seat taken", expSeat);

		const expDb = new Database(dbPath);
		expDb.pragma("foreign_keys = ON");
		expDb.prepare(
			`INSERT INTO event_waitlist (id,event_id,user_id,status,joined_at) VALUES (?,?,?,?,?)`,
		).run("e4000000-0000-4000-8000-000000000002", EXPIRY_EVENT, wlUsers[1], "waiting", new Date().toISOString());
		expDb.close();

		await cancelRegistration({ registrationId: expSeat.registrationId, userId: wlUsers[0] });

		// Force the offer into the past, then reconcile.
		const expireDb = new Database(dbPath);
		expireDb.prepare("UPDATE event_waitlist SET offer_expires_at = ? WHERE id = ?")
			.run("2020-01-01T00:00:00.000Z", "e4000000-0000-4000-8000-000000000002");
		expireDb.close();

		const reconciled = await reconcileEventWaitlist(EXPIRY_EVENT, new Date().toISOString());
		check(reconciled.expired >= 1, "reconcile expires a stale offer", reconciled.expired);

		const afterExpiry = new Database(dbPath);
		const expiredEntry = afterExpiry.prepare(
			"SELECT status FROM event_waitlist WHERE id = ?",
		).get("e4000000-0000-4000-8000-000000000002");
		const expiredReserved = afterExpiry.prepare(
			"SELECT waitlist_reserved_count AS n FROM events WHERE id = ?",
		).get(EXPIRY_EVENT).n;
		afterExpiry.close();
		check(expiredEntry?.status === "expired", "the stale offer is marked expired", expiredEntry?.status);
		check(expiredReserved === 0, "expiry releases the reserved seat", expiredReserved);

		// With the offer gone, the seat is genuinely free again.
		const late = await createRegistration({
			eventId: EXPIRY_EVENT, userId: wlUsers[2], formResponses: { name: "Late Arrival" },
		});
		check(late.ok === true, "the released seat can be taken", late);
	}

	section("payments — webhook signature, idempotency, guard");
	{
		const { createHmac } = await import("node:crypto");
		const { action: webhookAction } = await import("../src/routes/api.webhooks.paygate.ts");
		const { createRegistration } = await import("../src/server/registration/create.ts");
		const { cancelRegistration } = await import("../src/server/registration/cancel.ts");

		const raw = new Database(dbPath);
		raw.pragma("foreign_keys = ON");
		raw.prepare("INSERT INTO societies (id,name,slug,is_hidden) VALUES (?,?,?,0)")
			.run("f1000000-0000-4000-8000-000000000001", "Pay Society", "pay-society");
		raw.prepare(
			`INSERT INTO events (id,title,slug,date,status,registration_mode,registration_open,max_capacity,society_id,base_fee_paise,allow_self_cancellation)
			 VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
		).run("f2000000-0000-4000-8000-000000000001", "Paid Event", "paid-event-2",
			"2027-09-01T00:00:00.000Z", "published", "internal", 1, 10,
			"f1000000-0000-4000-8000-000000000001", 50000, 1);

		const payUsers = [];
		for (let i = 0; i < 3; i += 1) {
			const id = `f3000000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`;
			raw.prepare("INSERT INTO users (id,email) VALUES (?,?)").run(id, `pay${i}@example.com`);
			payUsers.push(id);
		}
		raw.close();

		const EVENT = "f2000000-0000-4000-8000-000000000001";

		// A paid registration starts pending.
		const pending = await createRegistration({
			eventId: EVENT, userId: payUsers[0], formResponses: { name: "Payer" },
		});
		check(pending.ok === true && pending.paymentRequired === true, "paid registration is pending", pending);

		const paymentId = "pay_test_0001";
		function signedRequest(body, options = {}) {
			const rawBody = JSON.stringify(body);
			const timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000));
			const secret = options.secret ?? "integration-webhook-secret-at-least-32-bytes";
			const signature = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
			return new Request("http://localhost/api/webhooks/paygate", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-PayGate-Event-Id": body.id,
					"X-PayGate-Timestamp": timestamp,
					"X-PayGate-Signature": `v1=${signature}`,
				},
				body: rawBody,
			});
		}

		function paidBody(eventId, overrides = {}) {
			return {
				id: eventId,
				type: "payment.paid",
				data: {
					payment: {
						id: paymentId,
						status: "paid",
						requestedAmount: { paise: 50000, rupees: 500 },
						payableAmount: { paise: 50037, rupees: 500.37 },
						externalId: EVENT,
						metadata: { registration_id: pending.registrationId, environment: "local" },
						transactionNote: `PayGate ${paymentId}`,
						paidAt: new Date().toISOString(),
						...overrides,
					},
				},
			};
		}

		// --- bad signature ---
		const badSig = await webhookAction({
			request: signedRequest(paidBody("evt_bad"), { secret: "wrong-secret-wrong-secret-wrong-secret" }),
			params: {}, context: {},
		});
		check(badSig.status === 400, "a bad signature is refused", badSig.status);

		// --- stale timestamp ---
		const stale = await webhookAction({
			request: signedRequest(paidBody("evt_stale"), { timestamp: Math.floor(Date.now() / 1000) - 4000 }),
			params: {}, context: {},
		});
		check(stale.status === 400, "a stale timestamp is refused", stale.status);

		// --- amount mismatch ---
		const wrongAmount = await webhookAction({
			request: signedRequest(paidBody("evt_amount", {
				requestedAmount: { paise: 40000, rupees: 400 },
			})),
			params: {}, context: {},
		});
		check(wrongAmount.status === 400, "an amount mismatch is refused", wrongAmount.status);

		// --- valid payment ---
		const ok = await webhookAction({
			request: signedRequest(paidBody("evt_paid_1")), params: {}, context: {},
		});
		check(ok.status === 200, "a valid webhook is accepted", ok.status);

		const afterPay = new Database(dbPath);
		const reg = afterPay.prepare(
			"SELECT registration_status, payment_status, ticket_id FROM registrations WHERE id = ?",
		).get(pending.registrationId);
		const ledgerRows = afterPay.prepare(
			"SELECT status, collected_paise, final_fee_paise FROM payments WHERE registration_id = ?",
		).all(pending.registrationId);
		afterPay.close();

		check(reg?.registration_status === "confirmed", "payment confirms the registration", reg?.registration_status);
		check(reg?.payment_status === "paid", "payment status becomes paid", reg?.payment_status);
		check(typeof reg?.ticket_id === "string" && reg.ticket_id.length > 0, "a ticket is issued", reg?.ticket_id);
		check(ledgerRows.length === 1, "exactly one ledger row exists", ledgerRows.length);
		check(ledgerRows[0]?.status === "captured", "the ledger row is captured", ledgerRows[0]?.status);
		check(ledgerRows[0]?.collected_paise === 50037, "the collected amount includes the fingerprint", ledgerRows[0]?.collected_paise);

		// --- replay the same webhook ---
		const replay = await webhookAction({
			request: signedRequest(paidBody("evt_paid_1")), params: {}, context: {},
		});
		check(replay.status === 200, "a replayed webhook is accepted", replay.status);

		const afterReplay = new Database(dbPath);
		const ledgerAfter = afterReplay.prepare(
			"SELECT count(*) AS n FROM payments WHERE registration_id = ?",
		).get(pending.registrationId).n;
		const regAfter = afterReplay.prepare(
			"SELECT registration_status, payment_status FROM registrations WHERE id = ?",
		).get(pending.registrationId);
		afterReplay.close();
		check(ledgerAfter === 1, "replay does not create a second ledger row", ledgerAfter);
		check(regAfter?.registration_status === "confirmed" && regAfter?.payment_status === "paid",
			"replay does not change the state", regAfter);

		// --- a payment for a cancelled registration is parked, not applied ---
		const second = await createRegistration({
			eventId: EVENT, userId: payUsers[1], formResponses: { name: "Second Payer" },
		});
		check(second.ok === true, "second paid registration created", second);
		await cancelRegistration({ registrationId: second.registrationId, userId: payUsers[1] });

		const lateBody = {
			id: "evt_late_1",
			type: "payment.paid",
			data: {
				payment: {
					id: "pay_test_0002",
					status: "paid",
					requestedAmount: { paise: 50000, rupees: 500 },
					payableAmount: { paise: 50061, rupees: 500.61 },
					externalId: EVENT,
					metadata: { registration_id: second.registrationId, environment: "local" },
					transactionNote: "PayGate pay_test_0002",
					paidAt: new Date().toISOString(),
				},
			},
		};
		const late = await webhookAction({
			request: signedRequest(lateBody), params: {}, context: {},
		});
		check(late.status === 200, "a payment for a cancelled registration is accepted", late.status);

		const afterLate = new Database(dbPath);
		const lateReg = afterLate.prepare(
			"SELECT registration_status, payment_status, payment_data FROM registrations WHERE id = ?",
		).get(second.registrationId);
		const lateLedger = afterLate.prepare(
			"SELECT status, manual_review FROM payments WHERE registration_id = ?",
		).all(second.registrationId);
		afterLate.close();

		check(lateReg?.registration_status === "cancelled",
			"the cancelled registration stays cancelled", lateReg?.registration_status);
		check(String(lateReg?.payment_data ?? "").includes("manualReview"),
			"the payment is parked for manual review", lateReg?.payment_data?.slice(0, 40));
		check(lateLedger.some((row) => row.status === "manual_review"),
			"the ledger records a manual review", lateLedger);
	}

	// -----------------------------------------------------------------------
	// phase 4 — collection policy and admin/workspace authorization
	// -----------------------------------------------------------------------
	{
		const policy = await import("../src/server/collections/policy.ts");
		const admin = await import("../src/server/admin/service.ts");
		const workspace = await import("../src/server/workspace/service.ts");

		const columns = await policy.tableColumns("events");
		check(columns.has("title") && columns.has("society_id"),
			"tableColumns reads the live schema");

		// --- filter translation: the grammar is small and fails closed ---------
		const translated = policy.translateFilter("status = 'published' && is_deleted = 0", columns);
		check(translated.sql.includes('"status" = ?') && translated.sql.includes('"is_deleted" = ?'),
			"a valid filter compiles to bound parameters", translated.sql);
		check(translated.params.length === 2 && translated.params[0] === "published",
			"filter values are bound, never interpolated", translated.params);

		// camelCase is normalised to snake_case, matching the schema.
		const camel = policy.translateFilter("societyId = 'abc'", columns);
		check(camel.sql.includes('"society_id" = ?'),
			"filter fields are normalised to snake_case", camel.sql);

		// The admin event and society searches emit PocketBase's `~` operator.
		const contains = policy.translateFilter("title ~ 'work'", columns);
		check(contains.sql.includes("instr(lower(") && contains.params[0] === "work",
			"~ compiles to a bound contains match", contains.sql);
		const notContains = policy.translateFilter("title !~ 'draft'", columns);
		check(notContains.sql.includes("= 0") && notContains.params[0] === "draft",
			"!~ compiles to a bound not-contains match", notContains.sql);
		const literalWildcard = policy.translateFilter("title ~ '50%_off'", columns);
		check(literalWildcard.params[0] === "50%_off",
			"contains keeps % and _ literal", literalWildcard.params[0]);

		let rejected = null;
		try {
			policy.translateFilter("title = 'x'; DROP TABLE events; --", columns);
		} catch (err) {
			rejected = err.message;
		}
		check(rejected !== null, "a filter carrying SQL is rejected, not executed", rejected);

		let unknownField = null;
		try {
			policy.translateFilter("secret_column = 'x'", columns);
		} catch (err) {
			unknownField = err.message;
		}
		check(unknownField !== null, "an unknown filter field is rejected", unknownField);

		let badSort = null;
		try {
			policy.translateSort("-not_a_column", columns);
		} catch (err) {
			badSort = err.message;
		}
		check(badSort !== null, "an unknown sort field is rejected", badSort);

		const sort = policy.translateSort("-created_at,title", columns);
		check(sort.includes('"created_at" DESC') && sort.includes('"title" ASC'),
			"a valid sort compiles with direction", sort);

		// --- admin: capability gates ------------------------------------------
		const plainUser = { id: "u-plain", role: "user" };
		let forbidden = null;
		try {
			await admin.listPayments(plainUser, {});
		} catch (err) {
			forbidden = err;
		}
		check(forbidden?.status === 403 && forbidden?.code === "FORBIDDEN",
			"a plain user cannot read the payment desk", forbidden?.code);

		let healthForbidden = null;
		try {
			await admin.dataHealth(plainUser);
		} catch (err) {
			healthForbidden = err;
		}
		check(healthForbidden?.status === 403,
			"a plain user cannot read data health", healthForbidden?.code);

		// --- admin: role change guards ----------------------------------------
		let roleForbidden = null;
		try {
			await admin.changeUserRole(plainUser, "u-plain", "admin");
		} catch (err) {
			roleForbidden = err;
		}
		check(roleForbidden?.status === 403,
			"a non-admin cannot change a role", roleForbidden?.code);

		// --- workspace: role/scope mismatch and duplicates ---------------------
		const adminActor = { id: "u-admin", role: "admin" };
		let mismatch = null;
		try {
			await workspace.createAssignment(adminActor, {
				userId: "u-plain",
				roleCode: "society_chair",
				scopeType: "branch",
			});
		} catch (err) {
			mismatch = err;
		}
		check(mismatch !== null,
			"a society role cannot be granted at branch scope", mismatch?.code);

		let missingScope = null;
		try {
			await workspace.createAssignment(adminActor, {
				userId: "u-plain",
				roleCode: "society_chair",
				scopeType: "society",
			});
		} catch (err) {
			missingScope = err;
		}
		check(missingScope?.code === "SOCIETY_REQUIRED",
			"a society-scoped grant requires a society", missingScope?.code);

		let unknownUser = null;
		try {
			await workspace.createAssignment(adminActor, {
				userId: "does-not-exist",
				roleCode: "branch_chair",
				scopeType: "branch",
			});
		} catch (err) {
			unknownUser = err;
		}
		check(unknownUser?.status === 404,
			"granting a role to an unknown user is a 404", unknownUser?.code);

		// --- IDOR: a scoped actor never sees another event's registrations -----
		const scopedActor = { id: "u-scoped", role: "user" };
		const scoped = await admin.listRegistrations(scopedActor, {});
		check(Array.isArray(scoped.registrations) && scoped.registrations.length === 0,
			"an actor with no assignments sees no registrations", scoped.total);
		check(scoped.finance === false,
			"an actor without finance access gets no finance columns");

		// A specific event the actor cannot reach is refused, not silently ignored.
		const anyEvent = await db.query("SELECT id FROM events LIMIT 1");
		if (anyEvent.rows[0]) {
			let eventForbidden = null;
			try {
				await admin.listRegistrations(scopedActor, { eventId: anyEvent.rows[0].id });
			} catch (err) {
				eventForbidden = err;
			}
			check(eventForbidden?.status === 403,
				"a scoped actor cannot request another event's registrations", eventForbidden?.code);
		}

		// --- workspace: an actor cannot check in a ticket for an event they lack
		let checkInForbidden = null;
		try {
			await workspace.checkIn(plainUser, "TKT-NONEXISTENT", "");
		} catch (err) {
			checkInForbidden = err;
		}
		check(checkInForbidden?.status === 404 || checkInForbidden?.status === 403,
			"check-in refuses an unknown ticket before touching data", checkInForbidden?.code);
	}


	// -----------------------------------------------------------------------
	// phase 5 — attendance V2 (staging has zero rows; fixtures are built here)
	// -----------------------------------------------------------------------
	{
		const attendance = await import("../src/server/attendance/service.ts");

		// --- the fold that defines "present" -----------------------------------
		check(attendance.nextCreditState(false, "present") === true,
			"a present scan credits attendance");
		check(attendance.nextCreditState(false, "entry") === true,
			"an entry scan credits attendance");
		check(attendance.nextCreditState(false, "manual_add") === true,
			"a manual add credits attendance");
		check(attendance.nextCreditState(true, "manual_remove") === false,
			"a manual remove clears attendance");
		check(attendance.nextCreditState(true, "something_else") === true,
			"an unknown row type leaves state unchanged");

		// --- fixtures: an event, a confirmed registration, a session ----------
		const ev = await db.query(
			"INSERT INTO events (id, title, slug, date, society_id, status, check_in_enabled) VALUES (?,?,?,?,?,?,?) RETURNING id",
			["ev-att-1", "Attendance Test", "attendance-test", "2026-11-01", null, "published", 1],
		);
		check(ev.rows[0]?.id === "ev-att-1", "attendance fixture event created");

		await db.query(
			"INSERT INTO registrations (id, event_id, registration_status, ticket_id, user_name) VALUES (?,?,?,?,?)",
			["reg-att-1", "ev-att-1", "confirmed", "TKT-ATT-1", "Test Attendee"],
		);
		await db.query(
			"INSERT INTO registrations (id, event_id, registration_status, ticket_id, user_name) VALUES (?,?,?,?,?)",
			["reg-att-cancelled", "ev-att-1", "cancelled", "TKT-ATT-2", "Cancelled Attendee"],
		);
		await db.query(
			"INSERT INTO registrations (id, event_id, registration_status, ticket_id, user_name) VALUES (?,?,?,?,?)",
			["reg-att-2", "ev-att-1", "confirmed", "TKT-ATT-3", "Second Attendee"],
		);

		// The audit and session rows reference users, so the actor needs a real row.
		await db.query("INSERT INTO users (id, email, role) VALUES (?,?,?)", [
			"u-att-admin", "att-admin@test.local", "admin",
		]);
		const adminActor = { id: "u-att-admin", role: "admin" };

		// --- session configuration validation ---------------------------------
		let noTitle = null;
		try {
			await attendance.createSession(adminActor, "ev-att-1", { startsAt: "2026-11-01T09:00:00Z" });
		} catch (err) { noTitle = err; }
		check(noTitle?.code === "TITLE_REQUIRED", "a session needs a title", noTitle?.code);

		let badEnd = null;
		try {
			await attendance.createSession(adminActor, "ev-att-1", {
				title: "Morning", startsAt: "2026-11-01T09:00:00Z", endsAt: "2026-11-01T08:00:00Z",
			});
		} catch (err) { badEnd = err; }
		check(badEnd?.code === "INVALID_END", "a session end must follow its start", badEnd?.code);

		let badWeight = null;
		try {
			await attendance.createSession(adminActor, "ev-att-1", {
				title: "Morning", startsAt: "2026-11-01T09:00:00Z", attendanceWeight: 500,
			});
		} catch (err) { badWeight = err; }
		check(badWeight?.code === "INVALID_WEIGHT", "attendance weight is bounded 0..100", badWeight?.code);

		const created = await attendance.createSession(adminActor, "ev-att-1", {
			title: "Morning", startsAt: "2026-11-01T09:00:00Z", endsAt: "2026-11-01T11:00:00Z",
		});
		const sessionId = created.session.id;
		check(created.session.attendanceEnabled === true && created.session.checkInEnabled === true,
			"a new session is attendance- and check-in-enabled by default");
		check(created.session.presentCount === 0, "a new session has no attendance");

		check(await attendance.eventHasSessions("ev-att-1") === true,
			"the event is now in sessions mode");

		// --- check-in: idempotency and guards ---------------------------------
		let noKey = null;
		try {
			await attendance.attendanceCheckIn(adminActor, {
				ticketId: "TKT-ATT-1", eventId: "ev-att-1", sessionId,
			});
		} catch (err) { noKey = err; }
		check(noKey?.code === "IDEMPOTENCY_REQUIRED",
			"a scan without an idempotency key is refused", noKey?.code);

		const first = await attendance.attendanceCheckIn(adminActor, {
			ticketId: "TKT-ATT-1", eventId: "ev-att-1", sessionId, idempotencyKey: "scan-1",
		});
		check(first.success === true && first.replayed === false,
			"a first scan records attendance");
		check(first.presentCount === 1, "present count reflects the scan", first.presentCount);

		// Replaying the same key must not write a second row.
		const replay = await attendance.attendanceCheckIn(adminActor, {
			ticketId: "TKT-ATT-1", eventId: "ev-att-1", sessionId, idempotencyKey: "scan-1",
		});
		check(replay.replayed === true, "replaying a scan is recognised as a replay");
		const rowsAfterReplay = await attendance.attendanceRows(sessionId, "reg-att-1");
		check(rowsAfterReplay.length === 1,
			"a replayed scan writes exactly one row", rowsAfterReplay.length);

		// The same key used for a different registration is a conflict.
		let keyConflict = null;
		try {
			await attendance.attendanceCheckIn(adminActor, {
				ticketId: "TKT-ATT-3", eventId: "ev-att-1", sessionId, idempotencyKey: "scan-1",
			});
		} catch (err) { keyConflict = err; }
		check(keyConflict?.code === "IDEMPOTENCY_CONFLICT",
			"reusing a scan key for another attendee is a conflict", keyConflict?.code);

		// A second scan with a fresh key is refused: they are already present.
		let alreadyPresent = null;
		try {
			await attendance.attendanceCheckIn(adminActor, {
				ticketId: "TKT-ATT-1", eventId: "ev-att-1", sessionId, idempotencyKey: "scan-2",
			});
		} catch (err) { alreadyPresent = err; }
		check(alreadyPresent?.code === "ALREADY_PRESENT",
			"a duplicate scan is refused", alreadyPresent?.code);

		// A cancelled registration can never receive attendance credit.
		let notConfirmed = null;
		try {
			await attendance.attendanceCheckIn(adminActor, {
				ticketId: "TKT-ATT-2", eventId: "ev-att-1", sessionId, idempotencyKey: "scan-3",
			});
		} catch (err) { notConfirmed = err; }
		check(notConfirmed?.code === "NOT_CONFIRMED",
			"a cancelled registration cannot be checked in", notConfirmed?.code);

		// --- corrections: append-only, reason required ------------------------
		let noNote = null;
		try {
			await attendance.correctAttendance(adminActor, {
				registrationId: "reg-att-1", sessionId, action: "manual_remove",
			});
		} catch (err) { noNote = err; }
		check(noNote?.code === "NOTE_REQUIRED",
			"a correction without a reason is refused", noNote?.code);

		const removed = await attendance.correctAttendance(adminActor, {
			registrationId: "reg-att-1", sessionId, action: "manual_remove", note: "left early",
		});
		check(removed.present === false && removed.presentCount === 0,
			"a manual remove clears attendance", removed.presentCount);

		let removeAgain = null;
		try {
			await attendance.correctAttendance(adminActor, {
				registrationId: "reg-att-1", sessionId, action: "manual_remove", note: "again",
			});
		} catch (err) { removeAgain = err; }
		check(removeAgain?.code === "NOT_PRESENT",
			"removing someone who is not present is refused", removeAgain?.code);

		const readded = await attendance.correctAttendance(adminActor, {
			registrationId: "reg-att-1", sessionId, action: "manual_add", note: "came back",
		});
		check(readded.present === true && readded.presentCount === 1,
			"a manual add restores attendance", readded.presentCount);

		// Append-only: three rows now describe one attendee's history.
		const history = await attendance.attendanceRows(sessionId, "reg-att-1");
		check(history.length === 3,
			"history is append-only: scan, remove and add are three rows", history.length);

		const state = await attendance.registrationSessionState(sessionId, "reg-att-1");
		check(state.present === true,
			"derived state folds the history to present", state);

		// --- qualification lock blocks configuration and corrections ----------
		await attendance.lockQualification(adminActor, "ev-att-1", "results frozen");
		let lockedCreate = null;
		try {
			await attendance.createSession(adminActor, "ev-att-1", {
				title: "Evening", startsAt: "2026-11-01T18:00:00Z",
			});
		} catch (err) { lockedCreate = err; }
		check(lockedCreate?.code === "ATTENDANCE_QUALIFICATION_LOCKED",
			"a locked event refuses new sessions", lockedCreate?.code);

		let lockedCorrect = null;
		try {
			await attendance.correctAttendance(adminActor, {
				registrationId: "reg-att-1", sessionId, action: "manual_remove", note: "after lock",
			});
		} catch (err) { lockedCorrect = err; }
		check(lockedCorrect?.code === "ATTENDANCE_QUALIFICATION_LOCKED",
			"a locked event refuses corrections", lockedCorrect?.code);

		await attendance.reopenQualification(adminActor, "ev-att-1", "recount");
		const afterReopen = await attendance.createSession(adminActor, "ev-att-1", {
			title: "Evening", startsAt: "2026-11-01T18:00:00Z",
		});
		check(Boolean(afterReopen.session.id),
			"reopening qualification allows configuration again");

		// --- a session with attendance cannot be deleted ----------------------
		let hasAttendance = null;
		try {
			await attendance.deleteSession(adminActor, sessionId);
		} catch (err) { hasAttendance = err; }
		check(hasAttendance?.code === "SESSION_HAS_ATTENDANCE",
			"a session with attendance cannot be deleted", hasAttendance?.code);
	}


	// -----------------------------------------------------------------------
	// phase 7 — payment-expiry reconciliation
	// -----------------------------------------------------------------------
	{
		const reconcile = await import("../src/server/payments/reconcile.ts");
		const NOW = Date.parse("2026-11-16T12:00:00Z");
		const grace = 600;

		const base = {
			registration_status: "pending",
			payment_status: "pending",
			registration_date: "2026-11-16T11:00:00Z",
			created_at: "2026-11-16T11:00:00Z",
			payment_data: JSON.stringify({ provider: "paygate", providerStatus: "not_initialized" }),
		};

		// --- the release decision ---------------------------------------------
		check(reconcile.shouldReleasePendingRegistration(base, NOW, grace) === true,
			"a never-initialised payment past the grace window is released");

		check(reconcile.shouldReleasePendingRegistration(
			{ ...base, registration_date: "2026-11-16T11:55:00Z" }, NOW, grace) === false,
			"a never-initialised payment inside the grace window is kept");

		check(reconcile.shouldReleasePendingRegistration(
			{ ...base, payment_data: JSON.stringify({ provider: "paygate", providerStatus: "expired", expiresAt: "2026-11-16T11:00:00Z" }) },
			NOW, grace) === true,
			"an expired payment past the grace window is released");

		check(reconcile.shouldReleasePendingRegistration(
			{ ...base, payment_data: JSON.stringify({ provider: "paygate", providerStatus: "expired", expiresAt: "2026-11-16T11:59:00Z" }) },
			NOW, grace) === false,
			"an expired payment inside the grace window is kept");

		check(reconcile.shouldReleasePendingRegistration(
			{ ...base, payment_data: JSON.stringify({ provider: "paygate", providerStatus: "cancelled" }) },
			NOW, grace) === true,
			"a cancelled provider payment is released immediately");

		check(reconcile.shouldReleasePendingRegistration(
			{ ...base, payment_data: JSON.stringify({ provider: "paygate", providerStatus: "late" }) },
			NOW, grace) === true,
			"a late provider payment is released");

		check(reconcile.shouldReleasePendingRegistration(
			{ ...base, payment_data: JSON.stringify({ provider: "razorpay", providerStatus: "not_initialized" }) },
			NOW, grace) === false,
			"a registration on another provider is never released by this pass");

		check(reconcile.shouldReleasePendingRegistration(
			{ ...base, payment_status: "paid" }, NOW, grace) === false,
			"a paid registration is never released");

		check(reconcile.shouldReleasePendingRegistration(
			{ ...base, payment_data: JSON.stringify({ provider: "paygate", providerStatus: "unknown_state" }) },
			NOW, grace) === false,
			"an unrecognised provider state keeps the seat");

		// --- a full pass ------------------------------------------------------
		await db.query("INSERT INTO users (id, email, role) VALUES (?,?,?)", [
			"u-rec-admin", "rec@test.local", "admin",
		]);
		await db.query(
			"INSERT INTO events (id, title, slug, date, status) VALUES (?,?,?,?,?)",
			["ev-rec-1", "Reconcile Test", "reconcile-test", "2026-11-20", "published"],
		);

		const stale = JSON.stringify({ provider: "paygate", providerStatus: "not_initialized" });
		await db.query(
			`INSERT INTO registrations (id, event_id, registration_status, payment_status, registration_date, payment_data, created_at)
			 VALUES (?,?,?,?,?,?,?)`,
			["reg-rec-stale", "ev-rec-1", "pending", "pending", "2026-11-16T10:00:00Z", stale, "2026-11-16T10:00:00Z"],
		);
		// A provider session we cannot reach: must be kept, not released.
		await db.query(
			`INSERT INTO registrations (id, event_id, registration_status, payment_status, registration_date, payment_data, created_at)
			 VALUES (?,?,?,?,?,?,?)`,
			["reg-rec-unreachable", "ev-rec-1", "pending", "pending", "2026-11-16T10:00:00Z",
				JSON.stringify({ provider: "paygate", providerStatus: "pending", paymentId: "pay_1" }),
				"2026-11-16T10:00:00Z"],
		);

		const pass = await reconcile.reconcileExpiredRegistrations({
			now: NOW,
			graceSeconds: grace,
			probeProvider: async (row) =>
				row.id === "reg-rec-unreachable" ? { reachable: false } : null,
		});

		check(pass.releasedIds.includes("reg-rec-stale"),
			"the pass releases a stale pending registration", pass.releasedIds);
		check(!pass.releasedIds.includes("reg-rec-unreachable"),
			"the pass keeps a seat when the provider is unreachable", pass.releasedIds);
		check(pass.keptForProvider >= 1,
			"the pass counts seats kept for the provider", pass.keptForProvider);

		const releasedRow = await db.query(
			"SELECT registration_status, payment_status, payment_data FROM registrations WHERE id = ?",
			["reg-rec-stale"],
		);
		check(releasedRow.rows[0]?.registration_status === "cancelled",
			"a released registration is cancelled", releasedRow.rows[0]?.registration_status);
		check(releasedRow.rows[0]?.payment_status === "failed",
			"a released registration's payment is failed", releasedRow.rows[0]?.payment_status);
		check(String(releasedRow.rows[0]?.payment_data ?? "").includes("releaseReason"),
			"the release reason is recorded for the audit trail");

		const keptRow = await db.query(
			"SELECT registration_status FROM registrations WHERE id = ?",
			["reg-rec-unreachable"],
		);
		check(keptRow.rows[0]?.registration_status === "pending",
			"an unreachable provider leaves the registration pending for the next pass");

		// A second pass must not release the same row twice.
		const second = await reconcile.reconcileExpiredRegistrations({ now: NOW, graceSeconds: grace });
		check(!second.releasedIds.includes("reg-rec-stale"),
			"a released registration is not released again");
	}


	// -----------------------------------------------------------------------
	// phase 6 — certificate protected assets (the data-exposure surface)
	// -----------------------------------------------------------------------
	{
		const templates = await import("../src/server/certificates/templates.ts");
		const { mkdirSync, writeFileSync } = await import("node:fs");
		const { join } = await import("node:path");

		// Fixtures: an event, an authorised actor and an outsider.
		await db.query("INSERT INTO users (id, email, role) VALUES (?,?,?)", [
			"u-cert-admin", "cert-admin@test.local", "admin",
		]);
		await db.query("INSERT INTO users (id, email, role) VALUES (?,?,?)", [
			"u-cert-outsider", "cert-outsider@test.local", "user",
		]);
		await db.query(
			"INSERT INTO events (id, title, slug, date, status) VALUES (?,?,?,?,?)",
			["ev-cert-1", "Certificate Test", "certificate-test", "2026-11-01", "published"],
		);

		const TEMPLATE_ID = "tpl-cert-1";
		const BACKGROUND = "background.png";
		const SIGNATURE = "signature.png";
		const RENDER_BASE = "render-base.png";

		// Every protected field is populated, so each one can be probed.
		await db.query(
			`INSERT INTO certificate_templates
			   (id, name, scope_type, event_id, certificate_type, version, status,
			    source_background, source_signatures, render_base, canvas_width, canvas_height,
			    layout, email_subject, email_text, email_html, created_at, updated_at)
			 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			[
				TEMPLATE_ID, "Certificate", "event", "ev-cert-1", "participation", 1, "published",
				BACKGROUND, JSON.stringify([SIGNATURE]), RENDER_BASE, 2000, 1400,
				JSON.stringify({ name: { x: 0.5, y: 0.5 } }), "Subject", "Body", "",
				"2026-11-01T00:00:00Z", "2026-11-01T00:00:00Z",
			],
		);

		// Put real bytes on disk so a successful read is distinguishable.
		const templateDir = join(process.env.UPLOADS_DIR, "certificate_templates", TEMPLATE_ID);
		mkdirSync(templateDir, { recursive: true });
		for (const name of [BACKGROUND, SIGNATURE, RENDER_BASE]) {
			writeFileSync(join(templateDir, name), Buffer.from("PNG-PLACEHOLDER"));
		}

		const authorised = { id: "u-cert-admin", role: "admin" };
		const outsider = { id: "u-cert-outsider", role: "user" };
		const FIELDS = ["sourceBackground", "sourceSignatures", "renderBase"];
		const FILE_FOR = {
			sourceBackground: BACKGROUND,
			sourceSignatures: SIGNATURE,
			renderBase: RENDER_BASE,
		};

		async function attempt(actor, field, filename) {
			try {
				const result = await templates.resolveAsset(actor, TEMPLATE_ID, field, filename);
				return { ok: true, bytes: result.body.length };
			} catch (err) {
				return { ok: false, status: err.status, code: err.code };
			}
		}

		// --- 1. unauthenticated is refused for every protected field ----------
		for (const field of FIELDS) {
			const result = await attempt(null, field, FILE_FOR[field]);
			check(result.ok === false && result.status === 401,
				`an unauthenticated request for ${field} is refused`, result);
		}

		// --- 2. an under-privileged actor is refused for every field ----------
		// A 404 (not 403) so the outsider cannot confirm the template exists.
		for (const field of FIELDS) {
			const result = await attempt(outsider, field, FILE_FOR[field]);
			check(result.ok === false && result.status === 404,
				`an under-privileged request for ${field} is refused as not-found`, result);
		}

		// --- 3. a filename not stored on the row is refused -------------------
		for (const field of FIELDS) {
			const result = await attempt(authorised, field, "not-the-stored-name.png");
			check(result.ok === false && result.status === 404,
				`a guessed filename for ${field} is refused`, result);
		}

		// --- 4. an unknown field is refused -----------------------------------
		const unknownField = await attempt(authorised, "emailHtml", RENDER_BASE);
		check(unknownField.ok === false && unknownField.status === 404,
			"an unknown asset field is refused", unknownField);

		// --- 5. path traversal is refused -------------------------------------
		const traversal = await attempt(authorised, "renderBase", "../../../etc/passwd");
		check(traversal.ok === false && traversal.status === 404,
			"a traversal filename is refused", traversal);

		// --- 6. the authorised actor succeeds for every field -----------------
		for (const field of FIELDS) {
			const result = await attempt(authorised, field, FILE_FOR[field]);
			check(result.ok === true && result.bytes > 0,
				`the authorised actor can read ${field}`, result);
		}

		// --- 7. a template that does not exist is refused ---------------------
		try {
			await templates.resolveAsset(authorised, "tpl-does-not-exist", "renderBase", RENDER_BASE);
			check(false, "a missing template is refused");
		} catch (err) {
			check(err.status === 404, "a missing template is refused", err.code);
		}
	}


	// -----------------------------------------------------------------------
	// phase 7 — the notification outbox write path
	// -----------------------------------------------------------------------
	{
		const outbox = await import("../src/server/notifications/outbox.ts");
		const { withTransaction } = await import("../src/lib/db.server.ts");

		await db.query("INSERT INTO users (id, email, role) VALUES (?,?,?)", [
			"u-outbox", "outbox@test.local", "user",
		]);
		await db.query(
			"INSERT INTO events (id, title, slug, date, status) VALUES (?,?,?,?,?)",
			["ev-outbox", "Outbox Test", "outbox-test", "2026-11-01", "published"],
		);

		async function seedRegistration(id, overrides = {}) {
			// One event per registration: the active-registration unique index is
			// partial on (user_id, event_id), so sharing an event collides.
			await db.query(
				"INSERT INTO events (id, title, slug, date, status) VALUES (?,?,?,?,?)",
				[`ev-${id}`, `Event ${id}`, `event-${id}`, "2026-11-01", "published"],
			);
			const row = {
				registration_status: "confirmed",
				payment_status: "paid",
				ticket_id: `TKT-${id}`,
				user_email: "outbox@test.local",
				final_fee_paise: 50000,
				...overrides,
			};
			await db.query(
				`INSERT INTO registrations
				   (id, user_id, event_id, user_name, user_email, registration_status,
				    payment_status, ticket_id, final_fee_paise, amount, registration_date,
				    checked_in, created_at, updated_at)
				 VALUES (?,?,?,?,?,?,?,?,?,?,?,0,?,?)`,
				[
					id, "u-outbox", `ev-${id}`, "Outbox User", row.user_email,
					row.registration_status, row.payment_status, row.ticket_id,
					row.final_fee_paise, row.final_fee_paise / 100,
					"2026-11-01T00:00:00Z", "2026-11-01T00:00:00Z", "2026-11-01T00:00:00Z",
				],
			);
		}

		async function outboxRows(registrationId) {
			const result = await db.query(
				`SELECT kind, status, recipient, dedupe_key FROM notification_outbox
				  WHERE registration_id = ? ORDER BY kind`,
				[registrationId],
			);
			return result.rows;
		}

		// --- 1. a confirmed, paid registration queues exactly one ticket ------
		await seedRegistration("reg-outbox-1");
		await outbox.enqueueForRegistration("reg-outbox-1");
		const first = await outboxRows("reg-outbox-1");
		check(
			first.length === 2 &&
				first.filter((row) => row.kind === "ticket").length === 1 &&
				first.filter((row) => row.kind === "receipt").length === 1,
			"a confirmed paid registration queues exactly one ticket and one receipt",
			first,
		);
		check(
			first.every((row) => row.status === "pending" && row.recipient === "outbox@test.local"),
			"queued rows are pending and addressed to the registration email",
			first,
		);

		// --- 2. a replay dedupes ---------------------------------------------
		await outbox.enqueueForRegistration("reg-outbox-1");
		await outbox.enqueueForRegistration("reg-outbox-1");
		const replayed = await outboxRows("reg-outbox-1");
		check(replayed.length === 2, "replaying the enqueue does not create a second job", replayed);

		// --- 3. an unpaid registration queues a ticket but no receipt ---------
		await seedRegistration("reg-outbox-2", { payment_status: "pending", final_fee_paise: 50000 });
		await outbox.enqueueForRegistration("reg-outbox-2");
		const unpaid = await outboxRows("reg-outbox-2");
		check(
			unpaid.length === 1 && unpaid[0].kind === "ticket",
			"an unpaid registration queues a ticket and no receipt",
			unpaid,
		);

		// --- 4. a pending registration queues nothing -------------------------
		await seedRegistration("reg-outbox-3", {
			registration_status: "pending",
			payment_status: "pending",
			ticket_id: null,
		});
		await outbox.enqueueForRegistration("reg-outbox-3");
		check((await outboxRows("reg-outbox-3")).length === 0, "a pending registration queues nothing");

		// --- 5. a free registration queues a ticket but no receipt ------------
		await seedRegistration("reg-outbox-4", { final_fee_paise: 0 });
		await outbox.enqueueForRegistration("reg-outbox-4");
		const free = await outboxRows("reg-outbox-4");
		check(
			free.length === 1 && free[0].kind === "ticket",
			"a zero-fee registration queues a ticket and no receipt",
			free,
		);

		// --- 6. a rolled-back transaction queues nothing ----------------------
		// This is the invariant that matters: an email must never be queued for a
		// state change that did not commit.
		await seedRegistration("reg-outbox-5");
		try {
			await withTransaction(async () => {
				await outbox.enqueueForRegistration("reg-outbox-5");
				throw new Error("simulated rollback");
			});
		} catch {
			// expected
		}
		check(
			(await outboxRows("reg-outbox-5")).length === 0,
			"a rolled-back transaction queues nothing",
			await outboxRows("reg-outbox-5"),
		);

		// --- 7. the unique dedupe key is enforced by the schema ---------------
		await seedRegistration("reg-outbox-6");
		await outbox.enqueueForRegistration("reg-outbox-6");
		let duplicateRejected = false;
		try {
			await db.query(
				`INSERT INTO notification_outbox
				   (id, registration_id, kind, status, recipient, dedupe_key, attempts,
				    next_attempt_at, last_attempt_at, sent_at, last_error, created_at, updated_at)
				 VALUES (?,?,?,?,?,?,0,'','','','',?,?)`,
				[
					"ob-dup", "reg-outbox-6", "ticket", "pending", "outbox@test.local",
					"reg-outbox-6:ticket", "2026-11-01T00:00:00Z", "2026-11-01T00:00:00Z",
				],
			);
		} catch {
			duplicateRejected = true;
		}
		check(duplicateRejected, "the dedupe key is unique in the schema");
	}


	// -----------------------------------------------------------------------
	// phase 7 — event operations: manual registration, commands, decisions
	// -----------------------------------------------------------------------
	{
		const ops = await import("../src/server/admin/operations.ts");

		// A branch admin (sees everything) and a scoped organizer (sees one event).
		await db.query("INSERT INTO users (id, email, role) VALUES (?,?,?)", [
			"u-ops-admin", "ops-admin@test.local", "admin",
		]);
		await db.query("INSERT INTO users (id, email, role) VALUES (?,?,?)", [
			"u-ops-scoped", "ops-scoped@test.local", "user",
		]);
		await db.query("INSERT INTO users (id, email, role) VALUES (?,?,?)", [
			"u-ops-outsider", "ops-outsider@test.local", "user",
		]);
		await db.query(
			"INSERT INTO events (id, title, slug, date, status, max_capacity, check_in_enabled, registration_open, base_fee_paise, price) VALUES (?,?,?,?,?,?,?,?,?,?)",
			["ev-ops-a", "Ops A", "ops-a", "2026-12-01", "published", 2, 1, 1, 50000, 500],
		);
		await db.query(
			"INSERT INTO events (id, title, slug, date, status, max_capacity, check_in_enabled, registration_open, base_fee_paise, price) VALUES (?,?,?,?,?,?,?,?,?,?)",
			["ev-ops-b", "Ops B", "ops-b", "2026-12-02", "published", 10, 1, 1, 50000, 500],
		);
		// The scoped organizer holds a full set of event-scoped capabilities.
		for (const [i, role] of ["event_lead", "registration_staff"].entries()) {
			await db.query(
				`INSERT INTO organization_assignments
				   (id, user_id, role_code, scope_type, event_id, active, source, created_at, updated_at)
				 VALUES (?,?,?,'event',?,1,'manual',?,?)`,
				[`asg-ops-${i}`, "u-ops-scoped", role, "ev-ops-a", "2026-11-01T00:00:00Z", "2026-11-01T00:00:00Z"],
			);
		}

		const admin = { id: "u-ops-admin", role: "admin" };
		const scoped = { id: "u-ops-scoped", role: "user" };
		const outsider = { id: "u-ops-outsider", role: "user" };

		async function statusOf(fn) {
			try {
				await fn();
				return 200;
			} catch (err) {
				return err.status ?? 500;
			}
		}

		// --- 1. the feed is IDOR-proof ---------------------------------------
		check(
			(await statusOf(() => ops.getEventOperations(outsider, "ev-ops-a"))) === 404,
			"an outsider reading the operations feed gets 404, not 403",
		);
		check(
			(await statusOf(() => ops.getEventOperations(scoped, "ev-ops-b"))) === 404,
			"a scoped organizer reading a foreign event's feed gets 404",
		);
		await checkResolves(
			() => ops.getEventOperations(scoped, "ev-ops-a"),
			"a scoped organizer can read their own event's feed",
			(feed) => feed.event.id === "ev-ops-a" && typeof feed.permissions === "object",
		);

		// --- 2. manual registration ------------------------------------------
		const created = await ops.createManualRegistration(admin, "ev-ops-a", {
			name: "Manual Attendee",
			email: "manual@test.local",
			phone: "9876543210",
			paymentMode: "paid",
			paymentMethod: "cash",
			note: "paid at the desk",
		});
		check(
			created.registration.registrationStatus === "confirmed" &&
				created.registration.paymentStatus === "paid" &&
				created.registration.registrationSource === "admin",
			"a manual paid registration is confirmed and marked admin-sourced",
			created.registration,
		);

		const auditRows = await db.query(
			`SELECT action FROM admin_audit_log WHERE registration_id = ?`,
			[created.registration.id],
		);
		check(
			auditRows.rows.length === 1 && auditRows.rows[0].action === "registration.manual-create",
			"manual registration writes exactly one audit row",
			auditRows.rows,
		);

		const ledger = await db.query(
			`SELECT provider, status, collected_paise FROM payments WHERE registration_id = ?`,
			[created.registration.id],
		);
		check(
			ledger.rows.length === 1 &&
				ledger.rows[0].provider === "manual" &&
				ledger.rows[0].status === "captured",
			"a paid manual registration writes one captured ledger row",
			ledger.rows,
		);

		// A ticket email is queued for the confirmed registration.
		const manualOutbox = await db.query(
			`SELECT kind FROM notification_outbox WHERE registration_id = ?`,
			[created.registration.id],
		);
		check(
			manualOutbox.rows.length === 2 &&
				manualOutbox.rows.some((row) => row.kind === "ticket") &&
				manualOutbox.rows.some((row) => row.kind === "receipt"),
			"a paid manual registration queues a ticket and a receipt",
			manualOutbox.rows,
		);

		// --- 3. duplicates are refused ---------------------------------------
		check(
			(await statusOf(() =>
				ops.createManualRegistration(admin, "ev-ops-a", {
					name: "Manual Attendee",
					email: "manual@test.local",
					paymentMode: "pending",
				}),
			)) === 409,
			"a duplicate manual registration is refused",
		);

		// --- 4. finance-sensitive modes need finance.manage -------------------
		// The scoped organizer has registrations.manual but not finance.manage.
		check(
			(await statusOf(() =>
				ops.createManualRegistration(scoped, "ev-ops-a", {
					name: "Waived Attendee",
					email: "waived@test.local",
					paymentMode: "waived",
				}),
			)) === 403,
			"a waived registration without finance.manage is refused",
		);

		// --- 5. capacity is enforced, and an override needs a note -----------
		await ops.createManualRegistration(admin, "ev-ops-a", {
			name: "Second Attendee",
			email: "second@test.local",
			paymentMode: "pending",
		});
		check(
			(await statusOf(() =>
				ops.createManualRegistration(admin, "ev-ops-a", {
					name: "Third Attendee",
					email: "third@test.local",
					paymentMode: "pending",
				}),
			)) === 409,
			"a full event refuses another manual registration",
		);
		check(
			(await statusOf(() =>
				ops.createManualRegistration(admin, "ev-ops-a", {
					name: "Third Attendee",
					email: "third@test.local",
					paymentMode: "pending",
					capacityOverride: true,
				}),
			)) === 400,
			"a capacity override without a note is refused",
		);

		// --- 6. registration commands ----------------------------------------
		const pending = await ops.createManualRegistration(admin, "ev-ops-b", {
			name: "Pending Attendee",
			email: "pending@test.local",
			paymentMode: "pending",
		});
		const pendingId = pending.registration.id;
		check(
			pending.registration.registrationStatus === "pending" &&
				pending.registration.paymentStatus === "pending",
			"a pending manual registration stays pending",
			pending.registration,
		);

		check(
			(await statusOf(() =>
				ops.runRegistrationCommand(admin, pendingId, { action: "check-in" }),
			)) === 409,
			"a pending registration cannot be checked in",
		);
		check(
			(await statusOf(() => ops.runRegistrationCommand(admin, pendingId, { action: "nonsense" }))) === 400,
			"an unknown command is a 400, not a 403",
		);

		const confirmed = await ops.runRegistrationCommand(admin, pendingId, {
			action: "confirm-payment",
			note: "cash received",
		});
		check(
			confirmed.registration.registrationStatus === "confirmed" &&
				confirmed.registration.paymentStatus === "paid" &&
				confirmed.registration.ticketId !== "",
			"confirm-payment confirms the registration and issues a ticket",
			confirmed.registration,
		);

		// Idempotent no-op.
		const again = await ops.runRegistrationCommand(admin, pendingId, { action: "confirm-payment" });
		check(
			again.registration.registrationStatus === "confirmed",
			"confirm-payment on an already-paid registration is a no-op",
		);

		const checkedIn = await ops.runRegistrationCommand(admin, pendingId, { action: "check-in" });
		check(checkedIn.registration.checkedIn === true, "a confirmed attendee can be checked in");

		check(
			(await statusOf(() =>
				ops.runRegistrationCommand(admin, pendingId, { action: "mark-refunded" }),
			)) === 400,
			"mark-refunded without a note is refused",
		);

		const refunded = await ops.runRegistrationCommand(admin, pendingId, {
			action: "mark-refunded",
			note: "refunded in cash",
		});
		check(
			refunded.registration.registrationStatus === "cancelled" &&
				refunded.registration.paymentStatus === "refunded",
			"mark-refunded cancels the registration and records the refund",
			refunded.registration,
		);

		// --- 7. every command wrote its audit row ----------------------------
		const commandAudit = await db.query(
			`SELECT action FROM admin_audit_log WHERE registration_id = ? ORDER BY created_at`,
			[pendingId],
		);
		const actions = commandAudit.rows.map((row) => row.action);
		check(
			actions.includes("registration.confirm-payment") &&
				actions.includes("registration.check-in") &&
				actions.includes("registration.mark-refunded"),
			"every command wrote its audit row",
			actions,
		);

		// --- 8. a scoped organizer cannot command a foreign registration -----
		check(
			(await statusOf(() =>
				ops.runRegistrationCommand(scoped, pendingId, { action: "check-in" }),
			)) === 404,
			"a scoped organizer commanding a foreign registration gets 404",
		);

		// --- 9. cancellation decisions ---------------------------------------
		await db.query(
			`INSERT INTO registration_cancellation_requests
			   (id, registration_id, event_id, user_id, kind, active_key, status, reason,
			    requested_at, created_at, updated_at)
			 VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
			[
				"cr-ops-1", created.registration.id, "ev-ops-a", "u-ops-admin", "refund",
				"cr-ops-1", "open", "cannot attend", "2026-11-01T00:00:00Z",
				"2026-11-01T00:00:00Z", "2026-11-01T00:00:00Z",
			],
		);

		check(
			(await statusOf(() =>
				ops.decideCancellationRequest(admin, "cr-ops-1", { action: "accept" }),
			)) === 400,
			"a decision without a note is refused",
		);
		check(
			(await statusOf(() =>
				ops.decideCancellationRequest(outsider, "cr-ops-1", { action: "accept", note: "ok" }),
			)) === 404,
			"an outsider deciding a cancellation request gets 404",
		);

		const decided = await ops.decideCancellationRequest(admin, "cr-ops-1", {
			action: "accept",
			note: "approved by finance",
		});
		check(decided.request.status === "accepted", "accepting a request records the decision", decided.request);

		// Idempotent: the same decision again is a no-op, not a 409.
		const repeated = await ops.decideCancellationRequest(admin, "cr-ops-1", {
			action: "accept",
			note: "approved again",
		});
		check(repeated.request.status === "accepted", "repeating the same decision is a no-op");

		// A different decision on a decided request is refused.
		check(
			(await statusOf(() =>
				ops.decideCancellationRequest(admin, "cr-ops-1", { action: "decline", note: "changed my mind" }),
			)) === 409,
			"a conflicting decision on a decided request is refused",
		);

		const decisionAudit = await db.query(
			`SELECT action FROM admin_audit_log WHERE entity_id = ?`,
			["cr-ops-1"],
		);
		check(
			decisionAudit.rows.length === 1 &&
				decisionAudit.rows[0].action === "registration.refund-request.accepted",
			"the decision wrote exactly one audit row",
			decisionAudit.rows,
		);
	}

	// -----------------------------------------------------------------------
	// phase 8 — volunteer certificates (a credential with no registration)
	// -----------------------------------------------------------------------
	{
		const issuance = await import("../src/server/certificates/issuance.ts");

		await db.query("INSERT INTO users (id, email, role) VALUES (?,?,?)", [
			"u-vol-admin", "vol-admin@test.local", "admin",
		]);
		await db.query(
			"INSERT INTO events (id, title, slug, date, status) VALUES (?,?,?,?,?)",
			["ev-vol-1", "Volunteer Test", "volunteer-test", "2026-11-01", "published"],
		);
		await db.query(
			`INSERT INTO certificate_templates
			   (id, name, scope_type, event_id, certificate_type, version, status,
			    render_base, canvas_width, canvas_height, layout, email_subject, email_text,
			    created_at, updated_at)
			 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			[
				"tpl-vol-1", "Volunteer Certificate", "event", "ev-vol-1", "volunteer", 1,
				"published", "render-base.png", 2000, 1400, JSON.stringify({}),
				"Subject", "Body", "2026-11-01T00:00:00Z", "2026-11-01T00:00:00Z",
			],
		);
		await db.query(
			`INSERT INTO event_volunteers (id, event_id, name, email, role, active)
			 VALUES (?,?,?,?,?,?)`,
			["vol-1", "ev-vol-1", "Anagha Volunteer", "anagha@test.local", "Volunteer", 1],
		);
		await db.query(
			`INSERT INTO event_volunteers (id, event_id, name, email, role, active)
			 VALUES (?,?,?,?,?,?)`,
			["vol-2", "ev-vol-1", "Inactive Volunteer", "inactive@test.local", "Volunteer", 0],
		);

		const actor = { id: "u-vol-admin", role: "admin" };

		const listed = await issuance.listCandidates(actor, "ev-vol-1");
		check(
			listed.candidates.length === 0 && listed.volunteers.length === 2,
			"volunteers are listed separately from registrations",
			listed,
		);

		const preview = await issuance.previewAudience(actor, "ev-vol-1", {
			templateId: "tpl-vol-1",
			audienceType: "selected",
			audienceConfig: { volunteerIds: ["vol-1"] },
		});
		check(
			preview.recipientCount === 1 &&
				preview.recipients[0].id === "vol-1" &&
				preview.recipients[0].source === "volunteer",
			"a volunteer audience previews without a registration",
			preview.recipients,
		);

		const issued = await issuance.issueCertificates(actor, "ev-vol-1", {
			templateId: "tpl-vol-1",
			audienceType: "selected",
			audienceConfig: { volunteerIds: ["vol-1"] },
			audienceFingerprint: preview.audienceFingerprint,
		});
		const rows = await db.query(
			"SELECT registration_id, volunteer_id, status FROM certificates WHERE batch_id = ?",
			[issued.batch.id],
		);
		check(
			rows.rows.length === 1 &&
				rows.rows[0].registration_id === null &&
				rows.rows[0].volunteer_id === "vol-1" &&
				rows.rows[0].status === "active",
			"a volunteer certificate carries volunteer_id and no registration_id",
			rows.rows,
		);

		const again = await issuance.previewAudience(actor, "ev-vol-1", {
			templateId: "tpl-vol-1",
			audienceType: "selected",
			audienceConfig: { volunteerIds: ["vol-1"] },
		});
		check(
			again.recipientCount === 0 &&
				again.excluded.some((row) => row.reason === "already_issued"),
			"an already-credentialed volunteer is excluded from the next batch",
			again.excluded,
		);

		const inactive = await issuance.previewAudience(actor, "ev-vol-1", {
			templateId: "tpl-vol-1",
			audienceType: "selected",
			audienceConfig: { volunteerIds: ["vol-2"] },
		});
		check(
			inactive.recipientCount === 0 &&
				inactive.excluded.some((row) => row.reason === "inactive"),
			"an inactive volunteer is excluded with a reason",
			inactive.excluded,
		);

		await checkThrows(
			() =>
				issuance.previewAudience(actor, "ev-vol-1", {
					templateId: "tpl-vol-1",
					audienceType: "selected",
					audienceConfig: { volunteerIds: ["vol-1"], registrationIds: ["reg-x"] },
				}),
			/INVALID_AUDIENCE/,
			"mixing registrations and volunteers is refused",
		);

		await checkThrows(
			() =>
				db.query(
					`INSERT INTO certificates
					   (id, event_id, batch_id, template_id, certificate_type, credential_id,
					    verification_token, recipient_name_snapshot, event_title_snapshot,
					    issued_at, status)
					 VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
					[
						"cert-unowned", "ev-vol-1", issued.batch.id, "tpl-vol-1", "volunteer",
						"IEEESB-2026-VOL-UNOWNED", "t".repeat(48), "Nobody", "Volunteer Test",
						"2026-11-01T00:00:00Z", "active",
					],
				),
			/SQLITE_CONSTRAINT/,
			"a certificate with neither a registration nor a volunteer is refused",
		);
	}

	// -----------------------------------------------------------------------
	// phase 9 — outbound mail worker (transport injected, Gmail policy real)
	// -----------------------------------------------------------------------
	{
		const outbox = await import("../src/server/notifications/outbox.ts");
		const { runOutboxPass } = await import("../src/server/mail/worker.ts");
		const { setTransportForTesting } = await import("../src/server/mail/transport.server.ts");

		const captured = [];
		setTransportForTesting({
			sendMail: async (message) => {
				captured.push(message);
				return { accepted: [message.to], rejected: [] };
			},
			verify: async () => true,
		});

		const savedEnv = {
			DEPLOY_ENV: process.env.DEPLOY_ENV,
			MAIL_DELIVERY_MODE: process.env.MAIL_DELIVERY_MODE,
			MAIL_ALLOWLIST: process.env.MAIL_ALLOWLIST,
			SITE_URL: process.env.SITE_URL,
			SMTP_HOST: process.env.SMTP_HOST,
			SMTP_PORT: process.env.SMTP_PORT,
			SMTP_FROM: process.env.SMTP_FROM,
		};
		process.env.DEPLOY_ENV = "staging";
		process.env.MAIL_DELIVERY_MODE = "allowlist";
		process.env.MAIL_ALLOWLIST = "mail-worker@test.local";
		process.env.SITE_URL = "https://ieeesahrdaya.com";
		process.env.SMTP_HOST = "smtp.gmail.com";
		process.env.SMTP_PORT = "587";
		process.env.SMTP_FROM = "IEEE Sahrdaya <ieee@test.local>";

		await db.query("INSERT INTO users (id, email, role) VALUES (?,?,?)", [
			"u-mail-worker", "mail-worker@test.local", "user",
		]);
		await db.query(
			"INSERT INTO events (id, title, slug, date, end_date, venue, status) VALUES (?,?,?,?,?,?,?)",
			["ev-mail-worker", "Mail Worker Event", "mail-worker-event", "2027-01-01T04:00:00Z", "2027-01-02T12:00:00Z", "Sahrdaya", "published"],
		);
		const paymentData = JSON.stringify({ payableAmount: 500, paidAt: "2026-11-01T10:00:00Z" });
		await db.query(
			`INSERT INTO registrations
			   (id, user_id, event_id, user_name, user_email, registration_status, payment_status,
			    ticket_id, final_fee_paise, amount, payment_data, registration_date, checked_in,
			    created_at, updated_at)
			 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`,
			[
				"reg-mail-worker", "u-mail-worker", "ev-mail-worker", "Anagha Rose",
				"mail-worker@test.local", "confirmed", "paid", "TKT-MAIL-1", 50000, 500,
				paymentData, "2026-11-01T00:00:00Z", "2026-11-01T00:00:00Z", "2026-11-01T00:00:00Z",
			],
		);
		// Retire the rows earlier phases left pending so this pass only sees the
		// intents under test (attempts=8 keeps them out of the retry window).
		await db.query(
			`UPDATE notification_outbox SET status = 'failed', attempts = 8, next_attempt_at = '',
			        last_error = 'test cleanup'
			  WHERE status = 'pending'`,
		);

		await outbox.enqueueForRegistration("reg-mail-worker");

		const first = await runOutboxPass({ limit: 10 });
		const rows = await db.query(
			"SELECT kind, status, attempts, last_error, sent_at FROM notification_outbox WHERE registration_id = ? ORDER BY kind",
			["reg-mail-worker"],
		);
		check(
			rows.rows.length === 2 && rows.rows.every((row) => row.status === "sent" && row.sent_at),
			"the worker sends a queued ticket and receipt",
			rows.rows,
		);
		check(captured.length >= 2, "both messages reached the transport", captured.length);

		const receipt = captured.find((message) =>
			(message.attachments ?? []).some((attachment) => /^Receipt_.*\.pdf$/.test(attachment.filename)),
		);
		check(
			!!receipt && receipt.attachments[0].content.subarray(0, 5).toString() === "%PDF-",
			"the receipt email carries a real PDF attachment",
			receipt?.attachments?.map((attachment) => attachment.filename),
		);
		check(
			captured.every((message) => String(message.subject).startsWith("[STAGING TEST]")),
			"every non-live message is prefixed as a test",
			captured.map((message) => message.subject),
		);
		check(
			captured.every((message) => message.to === "mail-worker@test.local"),
			"the allowlisted recipient is the only address used",
			captured.map((message) => message.to),
		);
		check(first.sent >= 2, "the pass reports what it sent", first);

		// --- a recipient outside the allowlist spends no attempt --------------
		await db.query("INSERT INTO users (id, email, role) VALUES (?,?,?)", [
			"u-mail-blocked", "blocked@test.local", "user",
		]);
		await db.query(
			`INSERT INTO registrations
			   (id, user_id, event_id, user_name, user_email, registration_status, payment_status,
			    ticket_id, final_fee_paise, amount, registration_date, checked_in, created_at, updated_at)
			 VALUES (?,?,?,?,?,?,?,?,?,?,?,0,?,?)`,
			[
				"reg-mail-blocked", "u-mail-blocked", "ev-mail-worker", "Blocked User",
				"blocked@test.local", "confirmed", "pending", "TKT-MAIL-2", 0, 0,
				"2026-11-01T00:00:00Z", "2026-11-01T00:00:00Z", "2026-11-01T00:00:00Z",
			],
		);
		await outbox.enqueueForRegistration("reg-mail-blocked");
		const second = await runOutboxPass({ limit: 10 });
		const blocked = await db.query(
			"SELECT status, attempts FROM notification_outbox WHERE registration_id = ?",
			["reg-mail-blocked"],
		);
		check(
			blocked.rows.length === 1 && blocked.rows[0].status === "pending" && blocked.rows[0].attempts === 0,
			"a blocked recipient keeps its intent and spends no attempt",
			blocked.rows,
		);
		check(second.blocked >= 1, "the pass reports blocked rows", second);

		// --- a credential-intent that can never succeed fails once ------------
		await db.query("UPDATE registrations SET registration_status = 'cancelled' WHERE id = ?", [
			"reg-mail-worker",
		]);
		await db.query(
			`UPDATE notification_outbox
			    SET status = 'pending', attempts = 0, next_attempt_at = '', last_error = ''
			  WHERE registration_id = ? AND kind = 'ticket'`,
			["reg-mail-worker"],
		);
		await runOutboxPass({ limit: 10 });
		const permanent = await db.query(
			"SELECT status, attempts, last_error FROM notification_outbox WHERE registration_id = ? AND kind = 'ticket'",
			["reg-mail-worker"],
		);
		check(
			permanent.rows[0]?.status === "failed" &&
				permanent.rows[0]?.attempts === 1 &&
				String(permanent.rows[0]?.last_error).startsWith("NOTIFICATION_NO_LONGER_ELIGIBLE"),
			"an intent that can never succeed fails once with a permanent code",
			permanent.rows,
		);

		// --- the rolling daily cap stops a pass regardless of the batch size ---
		process.env.MAIL_DAILY_LIMIT = "1";
		const capped = await runOutboxPass({ limit: 10 });
		check(
			capped.capped === true && capped.sent === 0 && capped.sentToday >= 1,
			"the daily send cap stops the pass",
			capped,
		);
		delete process.env.MAIL_DAILY_LIMIT;

		setTransportForTesting(null);
		for (const [key, value] of Object.entries(savedEnv)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}

	// -----------------------------------------------------------------------
	// phase 10 — in-app backup: snapshot, archive, checksum, rotation
	// -----------------------------------------------------------------------
	{
		const { runBackup } = await import("../src/server/jobs/backup.ts");
		const { execFileSync } = await import("node:child_process");
		const { createHash } = await import("node:crypto");
		const { existsSync, readdirSync, readFileSync } = await import("node:fs");
		const { join } = await import("node:path");

		const backupDir = join(workDir, "backups");
		process.env.BACKUP_DIR = backupDir;
		process.env.BACKUP_KEEP = "1";
		process.env.DEPLOY_ENV = "test";

		const first = await runBackup();
		check(existsSync(first.archive) && first.bytes > 0, "the backup writes an archive", first);
		check(first.dbBytes > 0, "the database snapshot has bytes", first.dbBytes);

		const listing = execFileSync("tar", ["-tzf", first.archive], { encoding: "utf8" });
		check(
			listing.includes("portal.db") && listing.includes("manifest.json"),
			"the archive holds the database snapshot and manifest",
			listing.split("\n").slice(0, 6),
		);
		check(
			listing.split("\n").some((line) => line.startsWith("uploads/")),
			"the archive holds the uploads tree",
		);

		const digest = createHash("sha256").update(readFileSync(first.archive)).digest("hex");
		check(digest === first.sha256, "the reported sha256 matches the archive", first.sha256);

		// Distinct millisecond, so the second archive has its own name.
		await new Promise((resolve) => setTimeout(resolve, 15));
		const second = await runBackup();
		const archives = readdirSync(backupDir).filter((name) => name.endsWith(".tar.gz"));
		check(archives.length === 1 && second.pruned === 1, "rotation keeps BACKUP_KEEP archives", archives);
		check(second.archive !== first.archive, "each run writes a new archive", [first.archive, second.archive]);
	}


} catch (err) {
	failures.push({ label: "unexpected exception", detail: err?.stack ?? String(err) });
	console.error("\nUnexpected exception:", err);
} finally {
	closeDatabase();
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log("");
if (failures.length === 0) {
	console.log(`==== ${passed} passed, 0 failed ====`);
	rmSync(workDir, { recursive: true, force: true });
} else {
	console.log(`==== ${passed} passed, ${failures.length} failed ====`);
	console.log(`database kept for inspection: ${dbPath}`);
	process.exitCode = 1;
}
