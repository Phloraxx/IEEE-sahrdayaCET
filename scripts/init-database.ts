/**
 * Create a new, empty, current-version database at `SQLITE_PATH`. Explicit only.
 *
 *   SQLITE_PATH=/app/data/portal.db npx tsx scripts/init-database.ts [--apply]
 *
 * Dry run by default: it reports what it would do and writes nothing. `--apply`
 * creates the directory's file and applies `sqlite/schema.sql` at the current
 * version.
 *
 * Why this is a script and not part of boot
 * -----------------------------------------
 * The application refuses to invent production storage (see
 * `src/lib/db-migrate.server.ts`, `checkStorageLocation`). A container whose
 * database mount went missing would otherwise boot onto an empty portal that
 * looks healthy. Provisioning is therefore a deliberate operator action, taken
 * after checking that `SQLITE_DATA_DIR` is the mount meant for this environment.
 *
 * This does **not** replace the cutover. To adopt existing data, use
 * `scripts/migrate-pb-to-sqlite.ts` (PocketBase → SQLite) or
 * `scripts/restore-backup.ts` (a SQLite backup). Provisioning an empty database
 * where a populated one was expected silently serves an empty site.
 *
 * Safety
 * ------
 * * The parent directory must already exist: a missing directory is a missing
 *   mount, not a missing file.
 * * Anything already at the path that is not an empty file is refused, so a
 *   mistyped `SQLITE_PATH` cannot print a schema over real data.
 * * `:memory:` is refused.
 */

import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { provisionDatabase, readSchemaSql } from "../src/lib/db-migrate.server";

function argument(name: string): string {
	const index = process.argv.indexOf(name);
	return index >= 0 ? String(process.argv[index + 1] ?? "").trim() : "";
}

function main(): void {
	const apply = process.argv.includes("--apply");
	const path = resolve(argument("--path") || process.env.SQLITE_PATH || "./data/portal.db");
	const directory = dirname(path);

	console.log(`mode:      ${apply ? "APPLY" : "DRY RUN"}`);
	console.log(`database:  ${path}`);
	console.log(`deploy:    ${process.env.DEPLOY_ENV || "(unset)"}`);

	if (path === ":memory:") {
		console.error("refusing: SQLITE_PATH is :memory:; nothing to provision.");
		process.exitCode = 1;
		return;
	}

	if (!existsSync(directory) || !statSync(directory).isDirectory()) {
		console.error(
			`refusing: the directory ${directory} does not exist. Create and mount the database ` +
				"volume first; this script does not create mounts.",
		);
		process.exitCode = 1;
		return;
	}

	if (existsSync(path)) {
		const bytes = statSync(path).size;
		if (bytes > 0) {
			console.error(
				`refusing: ${path} already holds ${bytes} bytes. Restore a backup with ` +
					"scripts/restore-backup.ts, or point SQLITE_PATH at an empty location.",
			);
			process.exitCode = 1;
			return;
		}
		console.log("location:  an empty file exists at the path; it will be initialised");
	} else {
		console.log("location:  nothing exists at the path; it will be created");
	}

	// Reading the schema up front turns a missing file into a clear error before
	// any write, rather than a half-provisioned database.
	readSchemaSql();

	if (!apply) {
		console.log("");
		console.log("DRY RUN — nothing written. Re-run with --apply to provision.");
		return;
	}

	const result = provisionDatabase(path, { log: (line) => console.log(`  ${line}`) });
	console.log("");
	console.log(`provisioned ${result.path} at schema v${result.version} (${result.location})`);
	console.log("This database is empty. Run the cutover or restore a backup if it should hold data.");
}

try {
	main();
} catch (error) {
	console.error("[init-database] failed:", error instanceof Error ? error.message : error);
	process.exitCode = 1;
}
