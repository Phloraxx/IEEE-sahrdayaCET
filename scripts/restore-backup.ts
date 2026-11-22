/**
 * Extract and verify a backup archive into a scratch directory.
 *
 * This is the rehearsal half of the backup contract: it proves the archive in
 * `BACKUP_DIR` can be materialised and that the result is a complete, healthy
 * database with its uploads. It never touches the live data — extraction goes
 * to a target directory that must be empty (or `--force`), and the live
 * database is replaced by a human, after the app is stopped.
 *
 *   npx tsx scripts/restore-backup.ts --archive <file.tar.gz> --to <dir>
 *
 * Exit code 0 means every check passed. The JSON summary is the record.
 */

import Database from "better-sqlite3";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

interface Manifest {
	createdAt?: string;
	deployEnv?: string;
	database?: string;
	dbBytes?: number;
	schemaVersion?: string;
	tables?: number;
	uploadsEntry?: string;
	uploadFiles?: number;
}

interface Check {
	name: string;
	ok: boolean;
	detail: string;
}

function argument(name: string): string {
	const index = process.argv.indexOf(name);
	return index >= 0 ? String(process.argv[index + 1] ?? "").trim() : "";
}

function countFiles(root: string): number {
	if (!existsSync(root)) return 0;
	let count = 0;
	for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
		if (entry.isFile()) count += 1;
	}
	return count;
}

function fail(message: string): never {
	throw new Error(message);
}

function main() {
	const archive = resolve(argument("--archive") || "");
	const target = resolve(argument("--to") || "");
	const force = process.argv.includes("--force");

	if (!archive) fail("usage: tsx scripts/restore-backup.ts --archive <file.tar.gz> --to <dir> [--force]");
	if (!existsSync(archive)) fail(`archive not found: ${archive}`);
	if (!statSync(archive).isFile()) fail(`not a file: ${archive}`);
	if (!target) fail("--to <dir> is required");

	if (existsSync(target) && readdirSync(target).length > 0 && !force) {
		fail(`target is not empty: ${target} (pass --force to extract anyway)`);
	}
	mkdirSync(target, { recursive: true });

	execFileSync("tar", ["-xzf", archive, "-C", target], { stdio: ["ignore", "pipe", "pipe"] });

	const manifestPath = join(target, "manifest.json");
	if (!existsSync(manifestPath)) fail("archive has no manifest.json");
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;

	const databaseEntry = manifest.database || "portal.db";
	const dbPath = join(target, databaseEntry);
	if (!existsSync(dbPath)) fail(`archive has no ${databaseEntry}`);

	const checks: Check[] = [];
	const push = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

	// `integrity_check` on the restored file, not the live one: a corrupt copy is
	// worse than no backup because it looks like one.
	const db = new Database(dbPath, { readonly: true });
	const tables: Record<string, number> = {};
	let integrity: string;
	let foreignKeys: number;
	let userVersion: number;
	let tableCount: number;
	try {
		integrity = String(db.pragma("integrity_check", { simple: true }));
		foreignKeys = (db.pragma("foreign_key_check") as unknown[]).length;
		userVersion = db.pragma("user_version", { simple: true }) as number;
		const names = (
			db
				.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
				.all() as { name: string }[]
		).map((row) => row.name);
		tableCount = names.length;
		for (const name of names) {
			tables[name] = (db.prepare(`SELECT count(*) AS n FROM "${name}"`).get() as { n: number }).n;
		}
	} finally {
		db.close();
	}

	push("integrity_check", integrity === "ok", integrity);
	push("foreign_key_check", foreignKeys === 0, `${foreignKeys} violations`);
	if (typeof manifest.tables === "number") {
		push("table count", tableCount === manifest.tables, `${tableCount}/${manifest.tables}`);
	}
	if (manifest.schemaVersion !== undefined) {
		push("schema version", String(userVersion) === String(manifest.schemaVersion), `${userVersion}/${manifest.schemaVersion}`);
	}
	if (typeof manifest.dbBytes === "number") {
		const bytes = statSync(dbPath).size;
		// VACUUM INTO output size is stable; a difference means a different file.
		push("database bytes", bytes === manifest.dbBytes, `${bytes}/${manifest.dbBytes}`);
	}

	if (manifest.uploadsEntry) {
		const uploadsPath = join(target, manifest.uploadsEntry);
		const files = countFiles(uploadsPath);
		push("uploads directory", existsSync(uploadsPath), manifest.uploadsEntry);
		if (typeof manifest.uploadFiles === "number") {
			push("uploads files", files === manifest.uploadFiles, `${files}/${manifest.uploadFiles}`);
		}
	}

	const ok = checks.every((check) => check.ok);
	console.log(
		JSON.stringify(
			{
				at: new Date().toISOString(),
				archive,
				target,
				manifest,
				checks,
				tables,
				ok,
			},
			null,
			2,
		),
	);
	if (!ok) process.exitCode = 1;
}

try {
	main();
} catch (error) {
	console.error("[restore-backup] failed:", error instanceof Error ? error.message : error);
	process.exitCode = 1;
}
