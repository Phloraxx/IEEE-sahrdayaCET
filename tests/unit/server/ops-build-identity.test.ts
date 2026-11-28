import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import {
	buildFingerprint,
	buildIdentity,
	identityMatches,
	normalizeSha,
	normalizeTree,
	resolveBuildIdentity,
} from "../../../src/server/build-identity.server";

const KEYS = ["GIT_COMMIT", "GIT_TREE", "GIT_BUILT_AT", "GIT_IMAGE_DIGEST", "DEPLOY_ENV"] as const;
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

function withEnv(values: Partial<Record<(typeof KEYS)[number], string>>, fn: () => void) {
	for (const key of KEYS) delete process.env[key];
	Object.assign(process.env, values);
	try {
		fn();
	} finally {
		for (const key of KEYS) {
			const value = saved[key];
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
}

/** The fingerprint the deploy script, CD and the probe compute in bash. */
function bashFingerprint(tree: string): string {
	return execFileSync("bash", [
		"-c",
		`printf 'ieee-tree\\0%s' '${tree}' | sha256sum | cut -c1-16`,
	])
		.toString()
		.trim();
}

const PR_HEAD = "1111111111111111111111111111111111111111";
const MERGE_COMMIT = "2222222222222222222222222222222222222222";
const TREE = "89abcdef0123456789abcdef0123456789abcdef";
const OTHER_TREE = "0123456789abcdef0123456789abcdef01234567";

describe("build identity", () => {
	it("accepts only full hex object ids", () => {
		expect(normalizeSha(PR_HEAD)).toBe(PR_HEAD);
		expect(normalizeSha(PR_HEAD.toUpperCase())).toBe(PR_HEAD);
		expect(normalizeSha("abc1234")).toBe("");
		expect(normalizeSha("main")).toBe("");
		expect(normalizeTree(TREE)).toBe(TREE);
		expect(normalizeTree("")).toBe("");
	});

	it("classifies a tree build, a commit-only build and a bare build", () => {
		withEnv({ GIT_COMMIT: PR_HEAD, GIT_TREE: TREE }, () => {
			expect(buildIdentity().kind).toBe("tree");
		});
		withEnv({ GIT_COMMIT: PR_HEAD }, () => {
			expect(buildIdentity().kind).toBe("source");
			expect(buildIdentity().commit).toBe(PR_HEAD);
		});
		withEnv({}, () => {
			expect(buildIdentity().kind).toBe("unknown");
		});
	});
});

describe("tree-only fingerprint", () => {
	it("matches the bash computation the gates use", () => {
		withEnv({ GIT_COMMIT: PR_HEAD, GIT_TREE: TREE }, () => {
			expect(buildFingerprint()).toBe(bashFingerprint(TREE));
		});
	});

	// The regression this test pins: the release PR head and the merge commit on
	// main have different SHAs but the same tree. A commit+tree fingerprint would
	// differ between them and fail a correct production deploy.
	it("is identical for the PR head and the merge commit that preserves its tree", () => {
		let pr = "";
		let merged = "";
		withEnv({ GIT_COMMIT: PR_HEAD, GIT_TREE: TREE }, () => {
			pr = buildFingerprint();
		});
		withEnv({ GIT_COMMIT: MERGE_COMMIT, GIT_TREE: TREE }, () => {
			merged = buildFingerprint();
		});
		expect(pr).toBe(merged);
	});

	it("differs for a genuinely different tree", () => {
		let a = "";
		let b = "";
		withEnv({ GIT_COMMIT: PR_HEAD, GIT_TREE: TREE }, () => {
			a = buildFingerprint();
		});
		withEnv({ GIT_COMMIT: PR_HEAD, GIT_TREE: OTHER_TREE }, () => {
			b = buildFingerprint();
		});
		expect(a).not.toBe(b);
		expect(a).toHaveLength(16);
	});

	it("needs no commit when the build carries a tree", () => {
		withEnv({ GIT_TREE: TREE }, () => {
			expect(buildIdentity().kind).toBe("tree");
			expect(buildIdentity().commit).toBe("");
			expect(buildFingerprint()).toBe(bashFingerprint(TREE));
		});
	});

	it("does not vary with the environment it runs in", () => {
		let staging = "";
		let production = "";
		withEnv({ GIT_COMMIT: PR_HEAD, GIT_TREE: TREE, DEPLOY_ENV: "staging" }, () => {
			staging = buildFingerprint();
		});
		withEnv({ GIT_COMMIT: PR_HEAD, GIT_TREE: TREE, DEPLOY_ENV: "production" }, () => {
			production = buildFingerprint();
		});
		expect(staging).toBe(production);
	});

	// Negative identity case: a commit-only build (an image CI published before
	// it passed the tree arg) must publish nothing, not a value no gate can match
	// and not one that could accidentally collide with a real tree.
	it("publishes nothing for a build without a tree, and says why", () => {
		withEnv({ GIT_COMMIT: MERGE_COMMIT }, () => {
			expect(buildFingerprint()).toBe("");
			expect(buildIdentity().kind).toBe("source");
		});
		withEnv({ GIT_TREE: TREE }, () => {
			// A tree without a commit is still a valid tree build.
			expect(buildFingerprint()).toBe(bashFingerprint(TREE));
			expect(buildIdentity().kind).toBe("tree");
			expect(buildIdentity().commit).toBe("");
		});
	});

	it("never collides a missing tree with a real one", () => {
		withEnv({ GIT_TREE: "" }, () => {
			const empty = buildFingerprint();
			withEnv({ GIT_TREE: TREE }, () => {
				expect(empty).not.toBe(buildFingerprint());
			});
		});
	});
});

describe("identity matching for abbreviated inputs", () => {
	it("matches an abbreviated hash as a prefix, and a full one exactly", () => {
		expect(identityMatches(TREE, TREE.slice(0, 8))).toBe(true);
		expect(identityMatches(TREE, TREE)).toBe(true);
		expect(identityMatches(TREE, "main")).toBe(false);
		expect(identityMatches(TREE, "f".repeat(7))).toBe(false);
		expect(identityMatches("", TREE)).toBe(false);
	});
});

describe("identity file fallback", () => {
	it("keeps an env value when one is present", () => {
		withEnv({ GIT_TREE: TREE }, () => {
			expect(resolveBuildIdentity()).toBe(true);
			expect(buildFingerprint()).toBe(bashFingerprint(TREE));
		});
	});

	it("never invents a tree when none is available", () => {
		withEnv({}, () => {
			// There may be a baked build/ in this checkout; if there is not, the
			// resolver must report absence rather than fabricate an identity.
			const resolved = resolveBuildIdentity();
			if (!resolved) expect(process.env.GIT_TREE ?? "").toBe("");
			else expect(normalizeTree(process.env.GIT_TREE)).toHaveLength(40);
		});
	});
});
