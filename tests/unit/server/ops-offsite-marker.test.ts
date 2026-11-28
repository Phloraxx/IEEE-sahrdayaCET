import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
	evaluateDrillMarker,
	evaluateMarker,
	evaluateUploadMarker,
	markerFileName,
	markerNames,
	newestMarkerPath,
	sha256Hex,
	validateMarker,
} from "../../../src/server/jobs/offsite-marker";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 10, 24, 6, 0, 0);
const ARCHIVE_SHA = "a".repeat(64);

let scratch = "";

beforeEach(() => {
	scratch = mkdtempSync(join(tmpdir(), "ieee-offsite-"));
});

afterEach(() => {
	rmSync(scratch, { recursive: true, force: true });
});

function uploadMarker(overrides: Record<string, unknown> = {}) {
	return {
		version: 1,
		kind: "upload",
		verifiedAt: new Date(NOW - HOUR).toISOString(),
		archiveSha256: ARCHIVE_SHA,
		archiveName: "ieee-sqlite-2026-11-24T024000Z.zip",
		target: "restic:b2:ieee-offsite",
		bytes: 97_823_114,
		proof: "metadata",
		remoteSha256: ARCHIVE_SHA,
		...overrides,
	};
}

function drillMarker(overrides: Record<string, unknown> = {}) {
	return {
		version: 1,
		kind: "drill",
		verifiedAt: new Date(NOW - HOUR).toISOString(),
		archiveSha256: ARCHIVE_SHA,
		archiveName: "ieee-sqlite-2026-11-24T024000Z.zip",
		target: "restic:b2:ieee-offsite",
		bytes: 97_823_114,
		proof: "read-back",
		restoreChecked: true,
		...overrides,
	};
}

function writeMarker(payload: unknown, when = NOW - HOUR, name?: string) {
	const kind = (payload as { kind?: string }).kind === "drill" ? "drill" : "upload";
	const path = join(scratch, name ?? markerFileName(new Date(when), kind));
	writeFileSync(path, JSON.stringify(payload));
	const seconds = when / 1000;
	utimesSync(path, seconds, seconds);
	return path;
}

/** A recent local archive, the thing that used to be mistaken for a copy. */
function writeLocalArchive(when = NOW - HOUR) {
	const path = join(scratch, "ieee-sqlite-2026-11-24T054000Z.zip");
	writeFileSync(path, "PK\u0003\u0004 local archive bytes");
	const seconds = when / 1000;
	utimesSync(path, seconds, seconds);
	return path;
}

describe("marker shape", () => {
	it("accepts a metadata-only upload marker", () => {
		expect(validateMarker(uploadMarker())).toEqual([]);
	});

	it("accepts a read-back upload and a drill", () => {
		expect(validateMarker(uploadMarker({ proof: "read-back", restoreChecked: true }))).toEqual([]);
		expect(validateMarker(drillMarker())).toEqual([]);
	});

	it("refuses an upload that claims read-back without a restore", () => {
		expect(validateMarker(uploadMarker({ proof: "read-back" })).map((p) => p.field)).toContain(
			"restoreChecked",
		);
	});

	it("refuses a drill that is not a read-back or not restored", () => {
		expect(validateMarker(drillMarker({ proof: "metadata" })).map((p) => p.field)).toContain("proof");
		expect(
			validateMarker(drillMarker({ restoreChecked: false })).map((p) => p.field),
		).toContain("restoreChecked");
	});

	it("refuses a local target, a bad kind and nonsense digests", () => {
		expect(validateMarker(uploadMarker({ target: "/home/drvij/backups" })).map((p) => p.field)).toContain(
			"target",
		);
		expect(validateMarker(uploadMarker({ kind: "seal" })).map((p) => p.field)).toContain("kind");
		expect(validateMarker(uploadMarker({ archiveSha256: "deadbeef" })).map((p) => p.field)).toContain(
			"archiveSha256",
		);
		expect(validateMarker(uploadMarker({ bytes: 0 })).map((p) => p.field)).toContain("bytes");
		expect(validateMarker(null).map((p) => p.field)).toEqual(["marker"]);
	});

	it("does not require a remote checksum", () => {
		const { remoteSha256: _omit, ...withoutRemote } = uploadMarker();
		expect(validateMarker(withoutRemote)).toEqual([]);
	});
});

describe("offsite freshness from upload markers", () => {
	// The regression: sealing or a recent local zip must never pass.
	it("fails when only a recent local archive exists", () => {
		writeLocalArchive();
		const verdict = evaluateUploadMarker({ directory: scratch, now: NOW, maxAgeMs: 31 * HOUR });
		expect(verdict.ok).toBe(false);
		expect(verdict.reason).toContain("no offsite upload marker");
	});

	it("passes on cheap metadata evidence, without any read-back", () => {
		writeMarker(uploadMarker());
		const verdict = evaluateUploadMarker({
			directory: scratch,
			now: NOW,
			maxAgeMs: 31 * HOUR,
			newestLocalSha256: ARCHIVE_SHA,
		});
		expect(verdict.ok).toBe(true);
		expect(verdict.marker?.proof).toBe("metadata");
	});

	it("fails when the marker is older than the budget", () => {
		writeMarker(uploadMarker({ verifiedAt: new Date(NOW - 40 * HOUR).toISOString() }), NOW - 40 * HOUR);
		const verdict = evaluateUploadMarker({ directory: scratch, now: NOW, maxAgeMs: 31 * HOUR });
		expect(verdict.ok).toBe(false);
		expect(verdict.reason).toContain("h ago");
	});

	it("fails when the copy predates the newest local archive", () => {
		writeMarker(uploadMarker());
		const verdict = evaluateUploadMarker({
			directory: scratch,
			now: NOW,
			maxAgeMs: 31 * HOUR,
			newestLocalSha256: sha256Hex("a newer archive"),
		});
		expect(verdict.ok).toBe(false);
		expect(verdict.reason).toContain("predates");
	});

	it("fails when the newest upload marker is unreadable", () => {
		writeFileSync(join(scratch, markerFileName(new Date(NOW - HOUR), "upload")), "{not json");
		const verdict = evaluateUploadMarker({ directory: scratch, now: NOW, maxAgeMs: 31 * HOUR });
		expect(verdict.ok).toBe(false);
		expect(verdict.reason).toContain("unreadable");
	});
});

describe("restore drill budget is independent", () => {
	it("is skipped when drills are not required", () => {
		const verdict = evaluateDrillMarker({
			directory: scratch,
			now: NOW,
			maxAgeMs: 90 * DAY,
			required: false,
		});
		expect(verdict.ok).toBe(true);
	});

	it("fails when required and never recorded", () => {
		writeMarker(uploadMarker());
		const verdict = evaluateDrillMarker({ directory: scratch, now: NOW, maxAgeMs: 90 * DAY, required: true });
		expect(verdict.ok).toBe(false);
		expect(verdict.reason).toContain("no restore drill has ever been recorded");
	});

	it("does not count an upload marker as a drill", () => {
		writeMarker(uploadMarker({ proof: "read-back", restoreChecked: true }));
		expect(markerNames(scratch, "drill")).toHaveLength(0);
		expect(
			evaluateDrillMarker({ directory: scratch, now: NOW, maxAgeMs: 90 * DAY, required: true }).ok,
		).toBe(false);
	});

	it("passes a recent drill", () => {
		writeMarker(drillMarker());
		expect(
			evaluateDrillMarker({ directory: scratch, now: NOW, maxAgeMs: 90 * DAY, required: true }).ok,
		).toBe(true);
	});

	it("fails an overdue drill", () => {
		// One drill, 120 days old: the newest (only) drill marker is past budget.
		writeMarker(
			drillMarker({ verifiedAt: new Date(NOW - 120 * DAY).toISOString() }),
			NOW - 120 * DAY,
		);
		const overdue = evaluateDrillMarker({
			directory: scratch,
			now: NOW,
			maxAgeMs: 90 * DAY,
			required: true,
		});
		expect(overdue.ok).toBe(false);
		expect(overdue.reason).toContain("days ago");
	});
});

describe("overview", () => {
	it("keeps the two kinds apart by name", () => {
		writeMarker(uploadMarker(), NOW - 5 * HOUR);
		writeMarker(drillMarker(), NOW - 2 * DAY);
		expect(markerNames(scratch, "upload")).toHaveLength(1);
		expect(markerNames(scratch, "drill")).toHaveLength(1);
		expect(newestMarkerPath(scratch, "upload")).toContain("ieee-offsite-");
		expect(newestMarkerPath(scratch, "drill")).toContain("ieee-offsite-drill-");
	});

	it("reports a fresh upload with an overdue drill separately", () => {
		writeMarker(uploadMarker());
		const result = evaluateMarker({
			directory: scratch,
			now: NOW,
			maxAgeMs: 31 * HOUR,
			drillMaxAgeMs: 90 * DAY,
			requireDrill: true,
		});
		expect(result.ok).toBe(true);
		expect(result.drill.ok).toBe(false);
	});

	it("treats an absent directory as no marker", () => {
		const verdict = evaluateUploadMarker({
			directory: join(scratch, "missing"),
			now: NOW,
			maxAgeMs: 31 * HOUR,
		});
		expect(verdict.ok).toBe(false);
	});

	it("writes upload and drill file names that sort by time", () => {
		const early = markerFileName(new Date(Date.UTC(2026, 10, 24, 2, 0, 0)), "upload");
		const late = markerFileName(new Date(Date.UTC(2026, 10, 24, 6, 0, 0)), "upload");
		expect(early < late).toBe(true);
		expect(early).toMatch(/^ieee-offsite-\d{8}T\d{6}Z\.json$/);
		expect(markerFileName(new Date(NOW), "drill")).toMatch(/^ieee-offsite-drill-\d{8}T\d{6}Z\.json$/);
	});

	it("keeps marker files separate from archives and subdirectories", () => {
		mkdirSync(join(scratch, "uploads"), { recursive: true });
		writeLocalArchive();
		writeMarker(uploadMarker());
		expect(markerNames(scratch, "upload")).toHaveLength(1);
	});
});
