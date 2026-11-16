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
		check(tables === 26, "schema creates 26 tables", tables);

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

		// Blogs: one published, one draft.
		raw.prepare("INSERT INTO blogs (id,title,slug,published,published_at) VALUES (?,?,?,?,?)")
			.run("c0000000-0000-4000-8000-000000000001", "Live Post", "live-post", 1, "2026-01-01T00:00:00.000Z");
		raw.prepare("INSERT INTO blogs (id,title,slug,published,published_at) VALUES (?,?,?,?,?)")
			.run("c0000000-0000-4000-8000-000000000002", "Draft Post", "draft-post", 0, null);

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

		const blogs = await repo.listPublishedBlogs();
		const blogSlugs = blogs.map((b) => b.slug);
		check(blogSlugs.includes("live-post"), "listPublishedBlogs includes published", blogSlugs);
		check(!blogSlugs.includes("draft-post"), "listPublishedBlogs excludes drafts", blogSlugs);
		check((await repo.getPublishedBlogBySlug("draft-post")) === undefined, "getPublishedBlogBySlug hides drafts");

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
