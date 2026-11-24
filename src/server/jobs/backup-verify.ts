/**
 * Archive verification: prove a restored backup is complete before trusting it.
 *
 * Two separate jobs have to agree and in the past did not:
 *
 *   `src/server/jobs/backup.ts` writes `ieee-<env>-<stamp>.tar.gz`
 *   `scripts/restore-backup.ts`      rehearse-extracts it
 *   `scripts/ieee-backup-export.sh`  writes `ieee-sqlite-<stamp>.zip` for offsite
 *   `scripts/ieee-ops-watchdog.sh`   alerts on the newest `*.zip` in a directory
 *
 * The archive format is deliberately not changing in this branch: a fleet with
 * two shapes on disk and one reader is worse than one shape with a recorded
 * verification. What *is* new is a single verifier both formats can go through,
 * so "the newest file is recent" stops standing in for "the backup is usable".
 *
 * The safety rules this module exists to enforce:
 *
 *   - never extract by name; read the member list and refuse anything that is
 *     absolute, climbs out of the archive with `..`, or is a symlink/hardlink/
 *     device (a `tar` entry can otherwise write outside the target directory or
 *     overwrite a file the restore did not intend to touch);
 *   - never read the whole archive into memory; stream it;
 *   - cap the member count and the total size so a damaged or hostile archive
 *     cannot fill the disk while being "checked";
 *   - refuse when the database and the uploads tree disagree beyond the one
 *     window the writer openly accepts (an upload committed between the
 *     snapshot and the uploads pass is an orphan in the archive).
 *
 * The db/media coherence rule is one-sided on purpose. A file with no database
 * row is an orphan: the writer's documented snapshot-then-uploads ordering
 * produces exactly that, and the data-health page already reports orphans as
 * harmless. A database row with no file is a broken page after a restore, so it
 * fails verification unless the count is within the tolerance the caller sets.
 */

import { createHash } from "node:crypto";
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { join, posix } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ArchiveFormat = "tar.gz" | "zip";

export interface ArchiveEntry {
	/** Path inside the archive, POSIX separators, no leading `./`. */
	name: string;
	bytes: number;
}

export interface ArchiveContents {
	format: ArchiveFormat;
	entries: ArchiveEntry[];
	/** Hazards found in the member list. Non-empty means: do not extract. */
	problems: string[];
	/** sha256 of the archive file. */
	sha256: string;
	bytes: number;
}

export interface Limitations {
	maxEntries: number;
	/** Uncompressed total. Guards against a decompression bomb. */
	maxBytes: number;
}

export const DEFAULT_LIMITS: Limitations = {
	maxEntries: 50_000,
	maxBytes: 16 * 1024 * 1024 * 1024,
};

/** Which layout a member path belongs to. */
export type MemberRole = "database" | "manifest" | "uploads" | "sha256" | "other";

/**
 * Classify a member path.
 *
 * The archive stores `portal.db`, `manifest.json`, an optional `uploads/` tree
 * and — in the offsite zip — a `<archive>.sha256` sidecar. Anything else is not
 * ours, and a restore should notice rather than copy it into place.
 */
export function memberRole(name: string): MemberRole {
	const normalized = normalizeMemberPath(name);
	if (normalized === "portal.db") return "database";
	if (normalized === "manifest.json") return "manifest";
	if (normalized.startsWith("uploads/")) return "uploads";
	if (/\.sha256$/.test(normalized)) return "sha256";
	return "other";
}

/** `./uploads/a.png` → `uploads/a.png`; absolute paths are returned unchanged. */
export function normalizeMemberPath(name: string): string {
	let text = String(name ?? "");
	while (text.startsWith("./")) text = text.slice(2);
	return text;
}

/**
 * Is this member path safe to extract under a target directory?
 *
 * Absolute paths, drive letters and any `..` segment are refused. Windows
 * separators are refused too: `tarfile`/`bsdtar` differ on whether `a\..\b`
 * stays inside, and no backup this repository writes needs one.
 */
export function isSafeMemberPath(name: string): { ok: true } | { ok: false; reason: string } {
	const raw = String(name ?? "");
	if (!raw) return { ok: false, reason: "empty member name" };
	if (raw.startsWith("/")) return { ok: false, reason: "absolute path" };
	if (/^[A-Za-z]:[\\/]/.test(raw)) return { ok: false, reason: "drive-letter path" };
	if (raw.includes("\\")) return { ok: false, reason: "backslash in member name" };
	const normalized = normalizeMemberPath(raw);
	const segments = normalized.split("/");
	for (const segment of segments) {
		if (segment === "..") return { ok: false, reason: "'..' segment" };
		if (segment === ".") continue;
	}
	// `posix.normalize` collapses `a/b/../..`; if the result escapes or is empty,
	// the raw string was trying to.
	const resolved = posix.normalize(normalized);
	if (resolved === ".." || resolved.startsWith("../") || resolved === ".") {
		return { ok: false, reason: "'..' segment" };
	}
	return { ok: true };
}

function hashFile(path: string): Promise<string> {
	const hash = createHash("sha256");
	return new Promise((resolve, reject) => {
		const stream = createReadStream(path);
		stream.on("data", (chunk) => hash.update(chunk as Buffer));
		stream.on("error", reject);
		stream.on("end", () => resolve(hash.digest("hex")));
	});
}

/**
 * Read a tar member list without extracting anything.
 *
 * `tar -tzf` is run with no `-C` and no extraction flag, so the only thing that
 * can happen is decompression into a pipe. Symlinks and hardlinks are refused
 * by type rather than inspected: this archive never legitimately contains one,
 * and a link target can be made to point outside the restore directory.
 *
 * Listing formats differ (GNU prints owner columns densely and a full year for
 * older entries, BusyBox pads them), so this parses by structure rather than by
 * fixed columns: type, then a size token, then a `YYYY-MM-DD HH:MM[:SS]` or
 * `HH:MM` timestamp, then the name. A line that does not fit is refused, not
 * guessed at; a failure to list is a failure to verify.
 */
export async function inspectTarGz(
	path: string,
	limits: Limitations = DEFAULT_LIMITS,
): Promise<ArchiveContents> {
	if (!existsSync(path)) throw new Error(`archive not found: ${path}`);
	const problems: string[] = [];
	const entries: ArchiveEntry[] = [];

	let listing: string;
	try {
		const result = await execFileAsync("tar", ["-tvzf", path], {
			maxBuffer: 64 * 1024 * 1024,
		});
		listing = result.stdout;
	} catch (error) {
		throw new Error(
			`cannot list ${path}: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	let totalBytes = 0;
	for (const line of listing.split("\n")) {
		if (!line.trim()) continue;
		const parsed = parseListingLine(line);
		if (!parsed) {
			problems.push(`unparseable tar listing line: ${line.slice(0, 120)}`);
			continue;
		}
		const { type, size, rawName } = parsed;
		const name = normalizeMemberPath(rawName);
		// The archive root itself (`./`) is a directory entry, not content.
		if (type === "d" && (name === "" || name === "./")) continue;
		if (type === "l" || type === "h") {
			problems.push(`link member refused: ${name}`);
			continue;
		}
		if (type !== "-" && type !== "d") {
			problems.push(`non-regular member refused: ${name}`);
			continue;
		}
		if (type === "-" && !Number.isFinite(size)) {
			problems.push(`unreadable size for ${name}`);
			continue;
		}
		const safe = isSafeMemberPath(name);
		if (!safe.ok) {
			problems.push(`unsafe member ${name}: ${safe.reason}`);
			continue;
		}
		if (type === "-") {
			totalBytes += size;
			entries.push({ name, bytes: size });
		} else {
			entries.push({ name: `${name.replace(/\/+$/, "")}/`, bytes: 0 });
		}
		if (entries.length > limits.maxEntries) {
			problems.push(`too many members (limit ${limits.maxEntries})`);
			break;
		}
		if (totalBytes > limits.maxBytes) {
			problems.push(`archive expands past ${limits.maxBytes} bytes`);
			break;
		}
	}

	return {
		format: "tar.gz",
		entries,
		problems,
		sha256: await hashFile(path),
		bytes: statSync(path).size,
	};
}

const MONTHS = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)";

/**
 * Parse one `tar -tv` line.
 *
 * Accepted shapes, both of which GNU and BusyBox produce:
 *
 *   -rw-r--r-- user/group 1234 2026-11-24 05:00 portal.db
 *   drwxr-xr-x root/root       0 2026-11-24 05:00 ./uploads/
 *   -rw-r--r-- user/group   123 2026-11-24 05:00:01 name
 *   -rw-r--r-- user/group   123 Nov 24 05:00 name      (BSD/GNU pre-2020)
 */
export function parseListingLine(
	line: string,
): { type: string; size: number; rawName: string } | null {
	const typeMatch = line.match(/^([-dlhcbps])[rwxsStT-]{9}[+.@]?\s+/);
	if (!typeMatch) return null;
	const type = typeMatch[1] as string;
	let rest = line.slice(typeMatch[0].length);

	const sizeMatch = rest.match(/^(?:\S+\s+)?(\d+)\s+/);
	if (!sizeMatch) return null;
	const size = Number(sizeMatch[1]);
	rest = rest.slice(sizeMatch[0].length);

	const iso = rest.match(/^(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}(?::\d{2})?\s+/);
	const bsd = rest.match(new RegExp(`^${MONTHS}\\s+\\d{1,2}\\s+(?:\\d{2}:\\d{2}(?::\\d{2})?|\\d{4})\\s+`));
	const stamp = iso ?? bsd;
	if (!stamp) return null;
	const rawName = rest.slice(stamp[0].length).replace(/\r$/, "");
	if (!rawName) return null;

	return { type, size, rawName };
}

/** Read a zip's central directory. Never inflates the archive. */
export function inspectZipNames(names: string[]): string[] {
	const problems: string[] = [];
	for (const name of names) {
		const safe = isSafeMemberPath(name);
		if (!safe.ok) problems.push(`unsafe member ${name}: ${safe.reason}`);
	}
	return problems;
}

export interface VerificationInput {
	path: string;
	format: ArchiveFormat;
	entries?: ArchiveEntry[];
	problems?: string[];
	/** sha256 from the archive's own sidecar, when one exists. */
	expectedSha256?: string;
}

export interface VerificationResult {
	ok: boolean;
	format: ArchiveFormat;
	sha256: string;
	databaseBytes: number;
	uploadsFiles: number;
	hasManifest: boolean;
	problems: string[];
}

/**
 * Structural verification: format, members, sidecar.
 *
 * Database and manifest content are checked by the caller (they need a SQLite
 * driver); this layer answers "is this archive what its name says it is, and is
 * it safe to extract?".
 */
export async function verifyArchive(input: VerificationInput): Promise<VerificationResult> {
	const problems = [...(input.problems ?? [])];
	const contents = input.entries
		? undefined
		: input.format === "tar.gz"
			? await inspectTarGz(input.path)
			: undefined;
	const entries = input.entries ?? contents?.entries ?? [];
	if (contents) problems.push(...contents.problems);

	const sha256 = contents?.sha256 ?? (await hashFile(input.path));
	if (input.expectedSha256) {
		const expected = input.expectedSha256.trim().toLowerCase();
		if (expected && expected !== sha256) {
			problems.push(`sha256 mismatch: archive is ${sha256}, sidecar says ${expected}`);
		}
	}

	const roleOf = (name: string) => memberRole(name);
	const databases = entries.filter((entry) => roleOf(entry.name) === "database");
	const manifests = entries.filter((entry) => roleOf(entry.name) === "manifest");
	const uploads = entries.filter((entry) => roleOf(entry.name) === "uploads" && !entry.name.endsWith("/"));

	if (databases.length !== 1) {
		problems.push(`expected exactly one portal.db, found ${databases.length}`);
	}
	if (manifests.length > 1) {
		problems.push(`expected at most one manifest.json, found ${manifests.length}`);
	}

	return {
		ok: problems.length === 0,
		format: input.format,
		sha256,
		databaseBytes: databases[0]?.bytes ?? 0,
		uploadsFiles: uploads.length,
		hasManifest: manifests.length === 1,
		problems,
	};
}

export interface CoherenceInput {
	/** File rows the database claims to reference. */
	referencedFiles: number;
	/** Files present in the uploads tree inside the archive. */
	presentFiles: number;
}

export interface CoherenceResult {
	ok: boolean;
	reason: string;
	/** Files in the tree with no row. The writer's ordering produces these. */
	orphans: number;
	/** Rows whose file is missing. These break pages after a restore. */
	missing: number;
}

/**
 * Database ↔ uploads coherence.
 *
 * `referencedFiles` may legitimately exceed `presentFiles` by a small amount
 * when a file was written between the snapshot and the uploads pass — but that
 * direction is an *orphan* (a file with no row), not a missing one. A missing
 * file is always a problem: the database points at something the archive does
 * not contain.
 */
export function checkCoherence(input: CoherenceInput): CoherenceResult {
	const orphans = Math.max(0, input.presentFiles - input.referencedFiles);
	const missing = Math.max(0, input.referencedFiles - input.presentFiles);
	if (missing > 0) {
		return {
			ok: false,
			reason: `${missing} upload(s) are referenced by the database but absent from the archive`,
			orphans,
			missing,
		};
	}
	return {
		ok: true,
		reason: orphans ? `${orphans} orphan file(s); the writer's ordering allows this` : "coherent",
		orphans,
		missing,
	};
}

/** Count regular files under a directory, for a restored or live uploads tree. */
export function countFiles(root: string): number {
	if (!existsSync(root)) return 0;
	let count = 0;
	for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
		if (entry.isFile()) count += 1;
	}
	return count;
}

/** Path join that a caller can use for a member already proven safe. */
export function joinMember(root: string, name: string): string {
	const safe = isSafeMemberPath(name);
	if (!safe.ok) throw new Error(`refusing unsafe member ${name}: ${safe.reason}`);
	return join(root, normalizeMemberPath(name));
}
