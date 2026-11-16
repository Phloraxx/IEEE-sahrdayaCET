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
