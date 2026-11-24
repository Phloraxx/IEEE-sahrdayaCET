/**
 * Assert the seeded release-gate database exists before the app starts.
 *
 * The app's `db.server.ts` creates `SQLITE_PATH` when it is missing (mkdir +
 * `new Database(...)`), which is right for a fresh deployment and wrong for a
 * gate: a startup against an absent database would come up healthy and serve an
 * empty site, and every "public page renders" assertion would fail for the
 * wrong reason — or, worse, a looser gate would pass. This check runs after the
 * seed and before the app, so a missing database is reported as exactly that.
 *
 * Usage: node tests/ci/assert-seeded.mjs <database path>
 */

import Database from "better-sqlite3";
import { existsSync } from "node:fs";

const dbPath = process.argv[2] || process.env.RELEASE_GATE_SQLITE_PATH || "";
if (!dbPath) {
	console.error("assert-seeded: no database path given");
	process.exit(1);
}
if (!existsSync(dbPath)) {
	console.error(
		`assert-seeded: ${dbPath} does not exist. The seed (tests/ci/seed.mjs) must run before the app starts; ` +
			"the app would otherwise create an empty database and report healthy.",
	);
	process.exit(1);
}

const db = new Database(dbPath, { readonly: true });
try {
	const version = db.pragma("user_version", { simple: true });
	if (Number(version) < 2) {
		console.error(`assert-seeded: ${dbPath} has schema user_version ${version}, expected >= 2`);
		process.exit(1);
	}
	const markers = {
		admin: db.prepare("SELECT COUNT(*) AS n FROM users WHERE email = 'ci-admin@example.test'").get()?.n,
		member: db.prepare("SELECT COUNT(*) AS n FROM users WHERE email = 'ci-member@example.test'").get()?.n,
		society: db.prepare("SELECT COUNT(*) AS n FROM societies WHERE id = 'ci-society'").get()?.n,
		publishedEvent: db.prepare("SELECT COUNT(*) AS n FROM events WHERE id = 'ci-event-published'").get()?.n,
		draftEvent: db.prepare("SELECT COUNT(*) AS n FROM events WHERE id = 'ci-event-draft'").get()?.n,
	};
	for (const [name, count] of Object.entries(markers)) {
		if (!count) {
			console.error(`assert-seeded: ${dbPath} is missing the ${name} marker; re-run tests/ci/seed.mjs`);
			process.exit(1);
		}
	}
	console.log(`assert-seeded: ok (${dbPath}, user_version ${version})`);
} finally {
	db.close();
}
