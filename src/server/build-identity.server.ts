/**
 * Build identity: what a running deployment is, in terms a deploy gate can check.
 *
 * The trap this module exists to avoid, found in review: a hash over *main's*
 * commit **and** tree cannot be compared against a production image that came
 * from a release PR. When a PR merges, GitHub creates a **merge commit** whose
 * SHA is new but whose tree is the merge result; CI published the image for the
 * tree it built on the PR head, and the CD webhook deploys `deploy/production`
 * pointing at main's commit. The commit can therefore legitimately be the
 * release PR's merge SHA while the tree is what matters and is identical.
 *
 * Consequences, and the design that follows from them:
 *
 *   - The **tree** is the only trustworthy link between "the commit CI tested"
 *     and "the image that is running". It survives squash, rebase and merge.
 *   - A fingerprint that mixes commit and tree would change whenever the commit
 *     SHA changed for the same content, which is exactly the false negative that
 *     makes a deploy gate useless. So the public fingerprint is **tree-only**.
 *   - A build without a tree (a plain `docker build .`) publishes no
 *     fingerprint at all rather than a value no gate can match. It is still a
 *     valid deployment; gates say "unverifiable" instead of pretending.
 *
 * Where the identity comes from: the Dockerfile bakes `GIT_COMMIT`, `GIT_TREE`
 * and `GIT_BUILT_AT` as build args, never from `/app/.git` (the runtime image
 * has none). The process reads its environment first — Compose passes the same
 * values — and falls back to the baked files, so a bare `docker compose up` on a
 * labelled image still knows what it is.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * `tree` when the build knows its git tree, `source` when it carried a commit
 * but no tree (prebuilt by an older CI, or a hand build), `unknown` otherwise.
 */
export type IdentityKind = "tree" | "source" | "unknown";

export interface BuildIdentity {
	kind: IdentityKind;
	/** Commit SHA the image was built from; `""` when the build carried none. */
	commit: string;
	/** Git tree of `commit`; `""` when unknown. */
	tree: string;
	/** Image digest supplied at runtime (`GIT_IMAGE_DIGEST`), when supplied. */
	digest: string;
	/** `DEPLOY_ENV` as this process sees it, lowercased; `""` when unset. */
	environment: string;
	/** ISO timestamp of the build, when supplied. */
	builtAt: string;
	/** First 12 characters of `commit`, or the kind when there is no commit. */
	short: string;
}

const FULL_SHA = /^[0-9a-f]{40}$/i;
const FULL_TREE = /^[0-9a-f]{40,64}$/i;
const SHORT_SHA = /^[0-9a-f]{7,40}$/i;

function clean(value: unknown): string {
	return String(value ?? "").trim();
}

/** Accept only a hex object id; anything else is treated as absent. */
export function normalizeSha(value: unknown): string {
	const text = clean(value).toLowerCase();
	return FULL_SHA.test(text) ? text : "";
}

export function normalizeTree(value: unknown): string {
	const text = clean(value).toLowerCase();
	return FULL_TREE.test(text) ? text : "";
}

/**
 * Does `reported` name `expected`?
 *
 * `expected` is what an operator or a deploy gate knows. It may be abbreviated
 * (`abc1234`, as git prints it) because that is what humans copy. A full hash
 * must match exactly; an abbreviation is matched as a prefix, which is git's own
 * rule and is unambiguous at eight or more characters.
 */
export function identityMatches(reported: string, expected: string): boolean {
	const actual = clean(reported).toLowerCase();
	const want = clean(expected).toLowerCase();
	if (!actual || !want) return false;
	if (want.length >= 40) return actual === want;
	if (!SHORT_SHA.test(want)) return false;
	return actual.startsWith(want);
}

/**
 * Resolve the identity from the process environment.
 *
 * Read on every call rather than cached: tests set the variables per case, and
 * the cost is a handful of property reads on a route that must stay cheap.
 */
export function buildIdentity(): BuildIdentity {
	const commit = normalizeSha(process.env.GIT_COMMIT);
	const tree = normalizeTree(process.env.GIT_TREE);
	const digest = clean(process.env.GIT_IMAGE_DIGEST);
	const environment = clean(process.env.DEPLOY_ENV).toLowerCase();
	const builtAt = clean(process.env.GIT_BUILT_AT);
	const kind: IdentityKind = tree ? "tree" : commit ? "source" : "unknown";

	return {
		kind,
		commit,
		tree,
		digest,
		environment,
		builtAt,
		short: commit ? commit.slice(0, 12) : kind,
	};
}

/**
 * A fingerprint of the deployed **tree**, or `""` when there is none.
 *
 * Tree-only on purpose: the commit SHA can differ between the release PR, the
 * merge commit and the main head for identical content, and a gate that keys on
 * it fails on correct deploys. Sixteen hex characters of
 * `sha256("ieee-tree\0<tree>")`. The deploy script, CD and the external probe
 * compute the same value with `sha256sum`; see the cross-check in
 * `tests/unit/server/ops-build-identity.test.ts`.
 *
 * A build with a commit but no tree (an image CI built before it passed the tree
 * arg) gets `""`: it can say what it is, but nothing can prove it matches a
 * release, and inventing a value it cannot match would turn "unverifiable" into
 * "wrong". `kind === "source"` is how a consumer tells the two apart.
 */
export function buildFingerprint(identity: BuildIdentity = buildIdentity()): string {
	if (!identity.tree) return "";
	return createHash("sha256").update(`ieee-tree\0${identity.tree}`).digest("hex").slice(0, 16);
}

/**
 * Where the Dockerfile leaves the baked identity.
 *
 * `import.meta.url` resolves to `build/server/` in a built image and to `src/`
 * under `react-router dev`; both are two levels below the directory that holds
 * `build/`. The lookup tolerates a missing file, which is the normal case for a
 * dev server.
 */
export function identityFilePaths(): { commit: string; tree: string; builtAt: string } {
	const here = dirname(fileURLToPath(import.meta.url));
	const root = resolve(here, "..", "..");
	return {
		commit: join(root, "build", "git-commit"),
		tree: join(root, "build", "git-tree"),
		builtAt: join(root, "build", "git-built-at"),
	};
}

function readIdentityFile(path: string): string {
	try {
		return existsSync(path) ? readFileSync(path, "utf8").trim() : "";
	} catch {
		return "";
	}
}

/**
 * Fill the identity from what the image baked in, once per process.
 *
 * Precedence: the process environment wins, because a Compose deployment sets
 * `GIT_COMMIT`/`GIT_TREE` from the same values the build received and a test
 * needs to override them. The files exist so a deployment made *without* env
 * vars (a bare `docker compose up`, a production pull where Dokploy does not
 * know what it pulled) still reports the tree it was built from.
 *
 * Returns `true` when a tree was resolved, so the boot log can say which case a
 * deployment is in.
 */
export function resolveBuildIdentity(): boolean {
	if (!normalizeTree(process.env.GIT_TREE)) {
		const tree = normalizeTree(readIdentityFile(identityFilePaths().tree));
		if (tree) process.env.GIT_TREE = tree;
	}
	if (!normalizeSha(process.env.GIT_COMMIT)) {
		const commit = normalizeSha(readIdentityFile(identityFilePaths().commit));
		if (commit) process.env.GIT_COMMIT = commit;
	}
	if (!clean(process.env.GIT_BUILT_AT)) {
		const builtAt = clean(readIdentityFile(identityFilePaths().builtAt));
		if (builtAt) process.env.GIT_BUILT_AT = builtAt;
	}
	return Boolean(normalizeTree(process.env.GIT_TREE));
}
