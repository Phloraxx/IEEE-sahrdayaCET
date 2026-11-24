/**
 * Offsite backup marker: evidence that a copy left this host, and separately
 * that a copy can still be restored.
 *
 * What went wrong without it: `scripts/ieee-ops-watchdog.sh` alerted when the
 * newest `*.zip` in the export directory was stale. That file is written by the
 * *local* export, before anything leaves the host. A restic profile that was
 * disabled, failing, or silently sealing archives left the local file present and
 * recent, so the watchdog stayed quiet while the only offsite copy aged out.
 *
 * The fix is two pieces of evidence, deliberately kept apart (revised
 * 2026-11-24 after review):
 *
 *   1. `upload`  — written after a verified remote PUT: the object exists at
 *                  `target` with the archive's size and sha256, confirmed by the
 *                  provider's response or a metadata (HEAD/stat) check. This is
 *                  cheap, runs with every backup, and is what the daily watchdog
 *                  freshness check reads.
 *   2. `drill`   — a periodic full read-back that downloads the object and
 *                  restores it. Expensive (bandwidth, egress, provider quota), so
 *                  it runs on its own cadence, not daily, and has its own age
 *                  budget.
 *
 * Requiring a full read-back every day would push a ~150 MB archive through a
 * metered provider (Backblaze B2 free egress is capped at roughly 3× stored data
 * per day) purely to prove freshness. It also conflates two questions: "is the
 * copy being replaced?" (upload) and "would a restore work?" (drill). The
 * watchdog therefore alerts on the upload's age, and separately on the drill's
 * age at a much longer budget, so a dry restore cadence cannot silence a stopped
 * copy job and a broken restore drilla cannot be masked by a healthy upload.
 *
 * Sealing an archive (rotating, compressing, moving it) produces neither marker:
 * only the copy step and the drill write them.
 *
 * Markers are small JSON files next to the local archives:
 *
 *   ieee-offsite-<UTC stamp>.json       kind: upload   (freshness)
 *   ieee-offsite-drill-<UTC stamp>.json kind: drill    (restore proof)
 *
 * Append-only: a marker is evidence for one run and is never rewritten, so a
 * rotation can be audited.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const MARKER_PREFIX = "ieee-offsite-";
export const DRILL_PREFIX = "ieee-offsite-drill-";
export const MARKER_SUFFIX = ".json";

export type MarkerKind = "upload" | "drill";

export interface OffsiteMarker {
	/** Schema version. `1` today. */
	version: 1;
	/** `upload` proves the copy exists remotely; `drill` proves it restores. */
	kind: MarkerKind;
	/** ISO timestamp of the completed run. */
	verifiedAt: string;
	/** sha256 of the local archive that was copied. */
	archiveSha256: string;
	/** File name of that archive, for an operator reading the marker. */
	archiveName: string;
	/** Where the copy lives, e.g. `restic:b2:ieee-offsite`. Never a secret or a personal path. */
	target: string;
	/** Bytes the remote store reports for the object. */
	bytes: number;
	/**
	 * How the remote copy was confirmed.
	 *
	 *   `metadata`  a HEAD/stat (size and provider checksum) after the PUT — cheap
	 *   `read-back` the object was downloaded and its sha256 matched — expensive
	 */
	proof: "metadata" | "read-back";
	/** sha256 the remote store reports, when it reports one. */
	remoteSha256?: string;
	/** For `proof: "read-back"`: the downloaded copy was restored and verified. */
	restoreChecked?: boolean;
	/** Files enumerated on the remote side, when the target can count them. */
	files?: number;
}

export interface MarkerProblem {
	field: string;
	reason: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Validate a marker's shape. Returns the list of problems; empty means the
 * marker is well-formed *and* asserts the facts the watchdog needs for its kind.
 */
export function validateMarker(value: unknown): MarkerProblem[] {
	const problems: MarkerProblem[] = [];
	if (!isObject(value)) return [{ field: "marker", reason: "not an object" }];
	const marker = value;

	if (marker.version !== 1) problems.push({ field: "version", reason: "must be 1" });

	const kind = String(marker.kind ?? "");
	if (kind !== "upload" && kind !== "drill") {
		problems.push({ field: "kind", reason: "must be 'upload' or 'drill'" });
	}

	const verifiedAt = String(marker.verifiedAt ?? "");
	if (!verifiedAt || Number.isNaN(Date.parse(verifiedAt))) {
		problems.push({ field: "verifiedAt", reason: "must be an ISO timestamp" });
	}

	const sha = String(marker.archiveSha256 ?? "").toLowerCase();
	if (!/^[0-9a-f]{64}$/.test(sha)) {
		problems.push({ field: "archiveSha256", reason: "must be a 64-character hex digest" });
	}

	if (!String(marker.archiveName ?? "").trim()) {
		problems.push({ field: "archiveName", reason: "must name the archive" });
	}

	const target = String(marker.target ?? "").trim();
	if (!target) {
		problems.push({ field: "target", reason: "must name the offsite storage" });
	} else if (/^(?:[A-Za-z]:)?[\\/]/.test(target) || target.startsWith("~")) {
		// A local path is the thing that was already being mistaken for an offsite
		// copy. Refuse it rather than let the marker miscount.
		problems.push({ field: "target", reason: "must be offsite storage, not a local path" });
	}

	if (!(typeof marker.bytes === "number" && marker.bytes > 0)) {
		problems.push({ field: "bytes", reason: "must be a positive number" });
	}

	const proof = String(marker.proof ?? "");
	if (proof !== "metadata" && proof !== "read-back") {
		problems.push({ field: "proof", reason: "must be 'metadata' or 'read-back'" });
	}

	if (marker.remoteSha256 !== undefined) {
		const remote = String(marker.remoteSha256).toLowerCase();
		if (!/^[0-9a-f]{64}$/.test(remote)) {
			problems.push({ field: "remoteSha256", reason: "must be a 64-character hex digest" });
		}
	}

	// A drill is defined by having restored what it read back.
	if (kind === "drill") {
		if (proof !== "read-back") {
			problems.push({ field: "proof", reason: "a drill must prove a read-back" });
		}
		if (marker.restoreChecked !== true) {
			problems.push({ field: "restoreChecked", reason: "a drill must be restore-checked" });
		}
	}
	// An upload may be proven by metadata alone; if it claims a read-back it must
	// also say the read-back was restored.
	if (kind === "upload" && proof === "read-back" && marker.restoreChecked !== true) {
		problems.push({ field: "restoreChecked", reason: "a read-back upload must be restore-checked" });
	}

	return problems;
}

function stampPrefix(kind: MarkerKind): string {
	return kind === "drill" ? DRILL_PREFIX : MARKER_PREFIX;
}

export function markerFileName(when: Date, kind: MarkerKind = "upload"): string {
	const stamp = when
		.toISOString()
		.replace(/[-:]/g, "")
		.replace(/\.\d{3}Z$/, "Z");
	return `${stampPrefix(kind)}${stamp}${MARKER_SUFFIX}`;
}

/** A stamp-sorted list of marker names for one kind, oldest first. */
export function markerNames(directory: string, kind: MarkerKind = "upload"): string[] {
	if (!existsSync(directory)) return [];
	const prefix = stampPrefix(kind);
	let names: string[];
	try {
		names = readdirSync(directory);
	} catch {
		return [];
	}
	// The drill prefix starts with the upload prefix, so exclude drill names from
	// the upload list explicitly rather than relying on ordering.
	return names
		.filter((name) => name.startsWith(prefix) && name.endsWith(MARKER_SUFFIX))
		.filter((name) => (kind === "drill" ? true : !name.startsWith(DRILL_PREFIX)))
		.sort();
}

/** Newest marker of one kind in a directory, or `""`. */
export function newestMarkerPath(directory: string, kind: MarkerKind = "upload"): string {
	const names = markerNames(directory, kind);
	const newest = names[names.length - 1];
	return newest ? join(directory, newest) : "";
}

export interface MarkerVerdict {
	ok: boolean;
	marker: OffsiteMarker | null;
	reason: string;
}

function readMarker(path: string): { marker: OffsiteMarker | null; reason: string } {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(path, "utf8"));
	} catch (error) {
		return {
			marker: null,
			reason: `${path.split("/").pop()} is unreadable: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
	const problems = validateMarker(parsed);
	if (problems.length) {
		return {
			marker: null,
			reason: `${path.split("/").pop()} is incomplete: ${problems.map((p) => `${p.field}: ${p.reason}`).join("; ")}`,
		};
	}
	return { marker: parsed as OffsiteMarker, reason: "" };
}

/**
 * Decide whether the offsite copy is being kept fresh, from `upload` markers.
 *
 * `newestLocalSha256` is the digest of the newest local archive. When set, an
 * upload older than that archive means the copy job is behind even if its last
 * run was recent enough on its own.
 */
export function evaluateUploadMarker(input: {
	directory: string;
	now: number;
	maxAgeMs: number;
	newestLocalSha256?: string;
}): MarkerVerdict {
	const path = newestMarkerPath(input.directory, "upload");
	if (!path) {
		return {
			ok: false,
			marker: null,
			reason:
				"no offsite upload marker exists; the newest local archive is NOT evidence of an offsite copy",
		};
	}
	const { marker, reason } = readMarker(path);
	if (!marker) return { ok: false, marker: null, reason };
	if (marker.kind !== "upload") {
		return { ok: false, marker, reason: "newest upload marker has the wrong kind" };
	}
	const age = input.now - Date.parse(marker.verifiedAt);
	if (!Number.isFinite(age) || age < 0) {
		return { ok: false, marker, reason: "newest upload marker has a future or unreadable timestamp" };
	}
	if (age > input.maxAgeMs) {
		return {
			ok: false,
			marker,
			reason: `offsite copy was last uploaded ${Math.round(age / 3_600_000)} h ago (max ${Math.round(input.maxAgeMs / 3_600_000)} h)`,
		};
	}
	if (input.newestLocalSha256 && marker.archiveSha256 !== input.newestLocalSha256) {
		return {
			ok: false,
			marker,
			reason: "the offsite copy predates the newest local archive",
		};
	}
	return { ok: true, marker, reason: "offsite copy is current" };
}

/**
 * Decide whether a restore drill is overdue, from `drill` markers.
 *
 * Separate from freshness on purpose: a daily upload can be healthy while the
 * last restore rehearsal was months ago, and that is exactly when a backup is
 * most likely to be silently un-restorable. The budget is long because a full
 * read-back costs bandwidth and provider egress quota.
 */
export function evaluateDrillMarker(input: {
	directory: string;
	now: number;
	maxAgeMs: number;
	/** Skip the check entirely when drills are not configured on this host. */
	required?: boolean;
}): MarkerVerdict {
	if (input.required === false) {
		return { ok: true, marker: null, reason: "restore drills are not configured on this host" };
	}
	const path = newestMarkerPath(input.directory, "drill");
	if (!path) {
		return {
			ok: false,
			marker: null,
			reason: "no restore drill has ever been recorded for the offsite copy",
		};
	}
	const { marker, reason } = readMarker(path);
	if (!marker) return { ok: false, marker: null, reason };
	if (marker.kind !== "drill") {
		return { ok: false, marker, reason: "newest drill marker has the wrong kind" };
	}
	const age = input.now - Date.parse(marker.verifiedAt);
	if (!Number.isFinite(age) || age < 0) {
		return { ok: false, marker, reason: "newest drill marker has a future or unreadable timestamp" };
	}
	if (age > input.maxAgeMs) {
		return {
			ok: false,
			marker,
			reason: `the last offsite restore drill was ${Math.round(age / 86_400_000)} days ago (max ${Math.round(input.maxAgeMs / 86_400_000)} days)`,
		};
	}
	return { ok: true, marker, reason: "restore drill is current" };
}

/**
 * Backwards-compatible overview used by the watchdog: freshness first, then the
 * drill budget. Kept as one entry point so the shell script has a single call.
 */
export function evaluateMarker(input: {
	directory: string;
	now: number;
	maxAgeMs: number;
	drillMaxAgeMs?: number;
	requireDrill?: boolean;
	newestLocalSha256?: string;
}): MarkerVerdict & { drill: MarkerVerdict } {
	const upload = evaluateUploadMarker(input);
	const drill = evaluateDrillMarker({
		directory: input.directory,
		now: input.now,
		maxAgeMs: input.drillMaxAgeMs ?? 90 * 24 * 60 * 60 * 1000,
		required: input.requireDrill,
	});
	return { ...upload, drill };
}

/** sha256 helper for a verifier script or a test fixture. */
export function sha256Hex(value: string | Buffer): string {
	return createHash("sha256").update(value).digest("hex");
}
