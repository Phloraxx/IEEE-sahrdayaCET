import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * The CD workflow reads the tree out of the published image's `ieee.tree` label
 * and hashes it. Both are shell, and both failed silently in an earlier draft:
 * `imagetools inspect` prints `ieee.tree: <sha>` (colon), not `ieee.tree=<sha>`,
 * so a `=`-only grep fell through to the git-tree fallback on every real image.
 *
 * These cases run the exact pipeline the workflow uses.
 */

const TREE = "89abcdef0123456789abcdef0123456789abcdef";

function extract(text: string): string {
	return execFileSync("bash", [
		"-c",
		// Same pipeline and the same `|| true` as the workflow step, which runs
		// under `set -euo pipefail`: grep exits non-zero when nothing matches.
		"grep -oE 'ieee\\.tree[=:][[:space:]]*[0-9a-f]+' | head -1 | grep -oE '[0-9a-f]+$' || true",
	], { input: text })
		.toString()
		.trim();
}

describe("CD artifact tree extraction", () => {
	it("reads the colon form imagetools prints", () => {
		const inspect = [
			"Name:      ghcr.io/phloraxx/ieee-sahrdaya-web:tree-" + TREE,
			"Manifests:",
			"  Annotations:",
			"    org.opencontainers.image.revision: 1111111111111111111111111111111111111111",
			`    ieee.tree: ${TREE}`,
		].join("\n");
		expect(extract(inspect)).toBe(TREE);
	});

	it("reads the equals form a manifest fallback may print", () => {
		expect(extract(`ieee.tree=${TREE}`)).toBe(TREE);
	});

	it("does not mistake the revision label for the tree", () => {
		const inspect = "    org.opencontainers.image.revision: " + "1".repeat(40);
		expect(extract(inspect)).toBe("");
	});

	it("yields nothing when the image has no tree label", () => {
		expect(extract("Name: something:latest\nDigest: sha256:abc")).toBe("");
	});
});
