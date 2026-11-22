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

import Database from "better-sqlite3";
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
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
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
		try {
			integrity = String(copy.pragma("integrity_check", { simple: true }));
		} finally {
			copy.close();
		}
		if (integrity !== "ok") throw new Error(`snapshot failed integrity_check: ${integrity}`);

		const dbBytes = statSync(snapshot).size;
		const uploadFiles = countFiles(env.UPLOADS_DIR);
		writeFileSync(
			join(temp, "manifest.json"),
			JSON.stringify(
				{
					createdAt: new Date().toISOString(),
					deployEnv: process.env.DEPLOY_ENV ?? "",
					database: "portal.db",
					dbBytes,
					uploads: env.UPLOADS_DIR,
					uploadFiles,
				},
				null,
				2,
			),
		);

		const archive = join(directory, `${backupPrefix()}-${timestampForFilename(Date.now())}.tar.gz`);
		const args = ["-czf", archive, "-C", temp, "portal.db", "manifest.json"];
		if (existsSync(env.UPLOADS_DIR)) {
			args.push("-C", dirname(env.UPLOADS_DIR), basename(env.UPLOADS_DIR));
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

		return { archive, bytes, sha256, dbBytes, uploadFiles, pruned: excess.length };
	} finally {
		rmSync(temp, { recursive: true, force: true });
	}
}
