import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
	checkCoherence,
	inspectTarGz,
	inspectZipNames,
	isSafeMemberPath,
	memberRole,
	verifyArchive,
} from "../../../src/server/jobs/backup-verify";

let scratch = "";

beforeEach(() => {
	scratch = mkdtempSync(join(tmpdir(), "ieee-verify-"));
});

afterEach(() => {
	rmSync(scratch, { recursive: true, force: true });
});

/** Build a tar.gz from literal member specs, so a hostile one is easy to write. */
function makeTar(name: string, files: Record<string, string>): string {
	const tree = join(scratch, `${name}-tree`);
	mkdirSync(tree, { recursive: true });
	for (const [path, body] of Object.entries(files)) {
		const target = join(tree, path);
		mkdirSync(join(target, ".."), { recursive: true });
		writeFileSync(target, body);
	}
	const archive = join(scratch, `${name}.tar.gz`);
	execFileSync("tar", ["-czf", archive, "-C", tree, "."]);
	return archive;
}

describe("member path safety", () => {
	it("refuses absolute, climbing and Windows-separated paths", () => {
		for (const bad of ["/etc/passwd", "../portal.db", "uploads/../../x", "C:\\x", "a\\..\\b", ""]) {
			expect(isSafeMemberPath(bad).ok, bad).toBe(false);
		}
	});

	it("accepts the paths this repository writes", () => {
		for (const good of ["portal.db", "manifest.json", "uploads/a/b.png", "./portal.db"]) {
			expect(isSafeMemberPath(good).ok, good).toBe(true);
		}
	});

	it("classifies members by role", () => {
		expect(memberRole("./portal.db")).toBe("database");
		expect(memberRole("manifest.json")).toBe("manifest");
		expect(memberRole("uploads/2026/x.webp")).toBe("uploads");
		expect(memberRole("ieee-sqlite-x.zip.sha256")).toBe("sha256");
		expect(memberRole("notes.txt")).toBe("other");
	});
});

describe("archive inspection", () => {
	it("lists a real archive without extracting it", async () => {
		const archive = makeTar("good", {
			"portal.db": "sqlite-bytes",
			"manifest.json": "{}",
			"uploads/a.png": "png",
		});
		const contents = await inspectTarGz(archive);
		expect(contents.problems).toEqual([]);
		const names = contents.entries
			.filter((entry) => !entry.name.endsWith("/"))
			.map((entry) => entry.name)
			.sort();
		expect(names).toEqual(["manifest.json", "portal.db", "uploads/a.png"]);
		expect(contents.sha256).toMatch(/^[0-9a-f]{64}$/);
	});

	it("flags an archive whose database is not at the top level", async () => {
		const archive = makeTar("nested", { "other/portal.db": "b" });
		const result = await verifyArchive({ path: archive, format: "tar.gz" });
		expect(result.ok).toBe(false);
		expect(result.problems.join(" ")).toContain("expected exactly one portal.db");
	});

	it("refuses an archive that carries a link", async () => {
		const tree = join(scratch, "link-tree");
		mkdirSync(tree, { recursive: true });
		writeFileSync(join(tree, "portal.db"), "x");
		execFileSync("ln", ["-s", "/etc/passwd", join(tree, "uploads-escape")]);
		const archive = join(scratch, "link.tar.gz");
		execFileSync("tar", ["-czf", archive, "-C", tree, "."]);
		const contents = await inspectTarGz(archive);
		expect(contents.problems.join(" ")).toContain("link member refused");
	});

	it("parses GNU and BusyBox listing shapes", async () => {
		const { parseListingLine } = await import("../../../src/server/jobs/backup-verify");
		const gnu = parseListingLine("-rw-r--r-- node/node 1234 2026-11-24 05:00 portal.db");
		expect(gnu).toEqual({ type: "-", size: 1234, rawName: "portal.db" });
		const busybox = parseListingLine("-rw-rw-r-- drvij/drvij       7 2026-11-24 14:12 ./uploads/a.png");
		expect(busybox).toEqual({ type: "-", size: 7, rawName: "./uploads/a.png" });
		const bsd = parseListingLine("-rw-r--r-- root/root 12 Nov 24 05:00 uploads/x");
		expect(bsd).toEqual({ type: "-", size: 12, rawName: "uploads/x" });
		expect(parseListingLine("total 42")).toBeNull();
	});

	it("refuses an archive whose sidecar does not match", async () => {
		const archive = makeTar("sidecar", { "portal.db": "a" });
		const result = await verifyArchive({
			path: archive,
			format: "tar.gz",
			expectedSha256: "0".repeat(64),
		});
		expect(result.ok).toBe(false);
		expect(result.problems.join(" ")).toContain("sha256 mismatch");
	});

	it("reports a missing database and manifest", async () => {
		const archive = makeTar("empty", { "uploads/a.png": "x" });
		const result = await verifyArchive({ path: archive, format: "tar.gz" });
		expect(result.ok).toBe(false);
		expect(result.problems.join(" ")).toContain("expected exactly one portal.db");
		expect(result.hasManifest).toBe(false);
	});

	it("refuses an unsafe name in a zip", () => {
		const problems = inspectZipNames(["portal.db", "../escape.db", "/abs.db"]);
		expect(problems).toHaveLength(2);
	});
});

describe("database and media coherence", () => {
	it("passes when every referenced upload is present", () => {
		const result = checkCoherence({ referencedFiles: 10, presentFiles: 10 });
		expect(result.ok).toBe(true);
		expect(result.orphans).toBe(0);
	});

	it("allows orphans the writer's ordering creates", () => {
		// The database is snapshotted first, then the uploads tree: a file written
		// between the two is in the archive with no row.
		const result = checkCoherence({ referencedFiles: 10, presentFiles: 12 });
		expect(result.ok).toBe(true);
		expect(result.orphans).toBe(2);
	});

	it("fails when rows point at files the archive does not contain", () => {
		const result = checkCoherence({ referencedFiles: 12, presentFiles: 10 });
		expect(result.ok).toBe(false);
		expect(result.missing).toBe(2);
		expect(result.reason).toContain("absent from the archive");
	});
});
