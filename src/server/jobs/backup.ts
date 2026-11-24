/**
 * In-app backup.
 *
 * `VACUUM INTO` gives a consistent snapshot without blocking writers (it reads
 * through WAL), and the uploads tree is added around it. The archive is a
 * `.tar.gz` plus a `manifest.json`, kept on the `BACKUP_DIR` volume and rotated.
 *
 * The snapshot is taken on a *separate read-only connection* so the app's shared
 * connection is not held during the copy. `tar` runs as a child process, which
 * matters because the SQLite driver is synchronous: a big synchronous copy would
 * stall every request on the event loop.
 */

import Database, { type Database as DatabaseHandle } from "better-sqlite3";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
	createReadStream,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";

import { getEnv } from "@/lib/env.server";
import { timestampForFilename } from "./clock";

const execFileAsync = promisify(execFile);

export interface BackupResult {
	archive: string;
	bytes: number;
	sha256: string;
	dbBytes: number;
	uploadFiles: number;
	/** Upload paths the snapshot's rows reference, for the coherence check. */
	referencedFiles: number;
	pruned: number;
}

export function backupDirectory(): string {
	return process.env.BACKUP_DIR?.trim() || "/app/backups";
}

export function backupKeep(): number {
	const parsed = Number.parseInt(process.env.BACKUP_KEEP ?? "", 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 14;
}

/** Archives are environment-prefixed so two environments can share a volume. */
export function backupPrefix(): string {
	const env = (process.env.DEPLOY_ENV || "unknown").trim().toLowerCase() || "unknown";
	return `ieee-${env}`;
}

function listBackups(): string[] {
	const dir = backupDirectory();
	if (!existsSync(dir)) return [];
	const prefix = `${backupPrefix()}-`;
	return readdirSync(dir)
		.filter((name) => name.startsWith(prefix) && name.endsWith(".tar.gz"))
		.sort();
}

/** mtime of the newest archive for this environment, or 0. */
export function latestBackupMs(): number {
	const files = listBackups();
	if (!files.length) return 0;
	const newest = files[files.length - 1] as string;
	try {
		return statSync(join(backupDirectory(), newest)).mtimeMs;
	} catch {
		return 0;
	}
}

function countFiles(root: string): number {
	if (!existsSync(root)) return 0;
	let count = 0;
	for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
		if (entry.isFile()) count += 1;
	}
	return count;
}

interface FileReference {
	table: string;
	column: string;
}

/**
 * Columns whose value is a stored upload filename.
 *
 * Read from the snapshot's own schema rather than hardcoded, because the set
 * grows whenever a collection gains an image field and a missed column would
 * make the coherence check silently under-count. Any TEXT column whose name is
 * `file`, ends in `_file`, or is one of the known image columns is counted when
 * its value looks like a stored filename (no separator, not a URL, has an
 * extension).
 *
 * The count is a *reference* count, not a row count: two rows can share a file,
 * so an exact match against the uploads tree is not expected. It is used the way
 * a backup check should use it — to catch an empty or wildly incomplete uploads
 * tree, and to distinguish "no uploads stored yet" from "uploads missing".
 */
function fileReferenceColumns(database: DatabaseHandle): FileReference[] {
	const tables = database
		.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
		.all() as Array<{ name: string }>;
	const columns: FileReference[] = [];
	const known = new Set(["file", "avatar", "image", "logo", "poster", "banner", "artwork", "photo"]);
	for (const table of tables) {
		const info = database.prepare(`PRAGMA table_info("${table.name.replace(/"/g, '""')}")`).all() as Array<{
			name: string;
			type: string;
		}>;
		for (const column of info) {
			if (!/TEXT/i.test(column.type || "")) continue;
			const lower = column.name.toLowerCase();
			if (known.has(lower) || lower.endsWith("_file")) {
				columns.push({ table: table.name, column: column.name });
			}
		}
	}
	return columns;
}

/**
 * How many rows in the snapshot reference a stored upload file.
 *
 * Best-effort by design: a column that does not exist in an older snapshot, or a
 * value that is not a filename, contributes nothing. The number is evidence in
 * the manifest, not a restore gate on its own — `checkCoherence` owns that.
 */
export function countFileReferences(database: DatabaseHandle): number {
	let total = 0;
	for (const reference of fileReferenceColumns(database)) {
		// Identifiers come from the schema, not from user input, but quote them
		// anyway: a column named `"image"` would otherwise break the statement.
		const table = `"${reference.table.replace(/"/g, '""')}"`;
		const column = `"${reference.column.replace(/"/g, '""')}"`;
		try {
			const row = database
				.prepare(
					`SELECT COUNT(*) AS n FROM ${table}
					  WHERE ${column} IS NOT NULL
					    AND TRIM(${column}) <> ''
					    AND ${column} NOT LIKE '%/%'
					    AND ${column} NOT LIKE 'http%'
					    AND ${column} LIKE '%.%'`,
				)
				.get() as { n: number };
			total += row?.n ?? 0;
		} catch {
			// A column this build does not know how to read is not a backup failure.
		}
	}
	return total;
}

async function sha256File(path: string): Promise<string> {
	const hash = createHash("sha256");
	await new Promise<void>((resolve, reject) => {
		const stream = createReadStream(path);
		stream.on("data", (chunk) => hash.update(chunk));
		stream.on("error", reject);
		stream.on("end", () => resolve());
	});
	return hash.digest("hex");
}

/**
 * Take one backup and rotate older archives for this environment.
 *
 * Throws on any failure (unwritable directory, integrity check, tar) so the
 * scheduler can record it and retry later rather than silently writing nothing.
 */
export async function runBackup(): Promise<BackupResult> {
	const env = getEnv();
	const dbPath = env.SQLITE_PATH;
	if (!existsSync(dbPath)) throw new Error(`database not found: ${dbPath}`);

	const directory = backupDirectory();
	mkdirSync(directory, { recursive: true });

	const temp = mkdtempSync(join(tmpdir(), "ieee-backup-"));
	try {
		const snapshot = join(temp, "portal.db");

		const source = new Database(dbPath, { readonly: true, fileMustExist: true });
		try {
			source.prepare("VACUUM INTO ?").run(snapshot);
		} finally {
			source.close();
		}

		// Verify the copy, not the live file: a corrupt snapshot is worse than no
		// backup because it looks like one.
		const copy = new Database(snapshot, { readonly: true });
		let integrity: string;
		let schemaVersion: string;
		try {
			integrity = String(copy.pragma("integrity_check", { simple: true }));
			schemaVersion = String(copy.pragma("user_version", { simple: true })).trim();
		} finally {
			copy.close();
		}
		if (integrity !== "ok") throw new Error(`snapshot failed integrity_check: ${integrity}`);

		const dbBytes = statSync(snapshot).size;
		const uploadFiles = countFiles(env.UPLOADS_DIR);
		// The archive stores the uploads directory under its own name, and the
		// manifest records that name so a restore does not have to guess.
		const uploadsEntry = existsSync(env.UPLOADS_DIR) ? basename(env.UPLOADS_DIR) : "";
		const layout = new Database(snapshot, { readonly: true });
		let tables: number;
		let referencedFiles: number;
		try {
			tables = (
				layout
					.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
					.get() as { n: number }
			).n;
			referencedFiles = countFileReferences(layout);
		} finally {
			layout.close();
		}
		writeFileSync(
			join(temp, "manifest.json"),
			JSON.stringify(
				{
					createdAt: new Date().toISOString(),
					deployEnv: process.env.DEPLOY_ENV ?? "",
					database: "portal.db",
					dbBytes,
					schemaVersion,
					tables,
					uploadsEntry,
					uploadFiles,
					// Rows the snapshot says point at an upload. A restore compares
					// this with the uploads tree it extracted; see backup-verify.ts.
					referencedFiles,
				},
				null,
				2,
			),
		);

		const archive = join(directory, `${backupPrefix()}-${timestampForFilename(Date.now())}.tar.gz`);

		// One `-C` only: BusyBox tar (the Alpine runtime) applies a second `-C`
		// after the file operands as a literal name and fails. The uploads tree is
		// staged as a symlink inside the temp directory and `-h` dereferences it,
		// so the archive still has a top-level `uploads/` entry. GNU tar behaves
		// the same way, which is what the host rehearsal runs.
		const args = ["-czhf", archive, "-C", temp, "portal.db", "manifest.json"];
		if (existsSync(env.UPLOADS_DIR)) {
			symlinkSync(env.UPLOADS_DIR, join(temp, "uploads"), "dir");
			args.push("uploads");
		}
		try {
			await execFileAsync("tar", args, { maxBuffer: 4 * 1024 * 1024 });
		} catch (error) {
			// Never leave a half-written archive behind: rotation would keep it.
			rmSync(archive, { force: true });
			throw error;
		}

		const bytes = statSync(archive).size;
		const sha256 = await sha256File(archive);

		const keep = backupKeep();
		const files = listBackups();
		const excess = files.slice(0, Math.max(0, files.length - keep));
		for (const name of excess) rmSync(join(directory, name), { force: true });

		return { archive, bytes, sha256, dbBytes, uploadFiles, referencedFiles, pruned: excess.length };
	} finally {
		rmSync(temp, { recursive: true, force: true });
	}
}
