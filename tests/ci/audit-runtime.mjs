/**
 * The production runtime's audit surface.
 *
 * Bun 1.4.5's `bun audit` is the authoritative source: it reads bun.lock, the
 * lockfile the image installs from, and `--prod` walks the production
 * dependency graph exactly as `bun install --production` resolves it. The npm
 * `package-lock` approximation over-reports (optional platform packages,
 * peer-only edges), so it is not used for decisions.
 *
 * Run:
 *   npx --yes bun@1.4.5 audit --prod --json | node tests/ci/audit-runtime.mjs
 *   npx --yes bun@1.4.5 audit --prod --json | node tests/ci/audit-runtime.mjs --explain
 *
 * Exit code 1 when a production advisory has no entry in KNOWN below. Every
 * known entry records why it is not patchable, or what makes it conditional,
 * so a new advisory cannot be accepted by silence. This is a report, not a CI
 * gate: a registry outage must not fail a release.
 */

import { readFileSync } from "node:fs";

/**
 * Advisories present in the production graph, with their disposition.
 *
 * `active` — the vulnerable code runs in production and no patched version can
 * be installed within the parent's declared ranges.
 * `conditional` — the code is present but the deployment does not reach the
 * vulnerable path; the reason is recorded and must be re-checked when the
 * condition changes.
 */
const KNOWN = {
	morgan: {
		severity: "moderate",
		disposition: "conditional",
		why:
			"morgan 1.11.0 is a hard dependency of @react-router/serve (^1.10.1), " +
			"which calls morgan('tiny') from its CLI. The advisories concern " +
			"log-forging through a logged field; `tiny` logs method, URL, status, " +
			"content length and response time only, and neither the User-Agent nor " +
			"the Referer header, so the injectable fields are not reached by this " +
			"deployment. Not patchable without pinning a version outside serve's " +
			"declared range.",
		recheck:
			"If @react-router/serve changes the morgan format away from `tiny`, or " +
			"widens its morgan range, re-dispose this entry.",
	},
};

const input = readFileSync(0, "utf8").trim();
const explain = process.argv.includes("--explain");
const report = input ? JSON.parse(input) : {};

let blockNew = 0;
let active = 0;
let conditional = 0;
const lines = [];
for (const [name, advisories] of Object.entries(report)) {
	const known = KNOWN[name];
	const severities = [...new Set(advisories.map((advisory) => advisory.severity))].sort();
	if (!known) {
		blockNew += 1;
		lines.push(`NEW        ${name} (${advisories.length} advisory, ${severities.join("/")}) — no disposition recorded`);
		continue;
	}
	if (known.disposition === "active") active += 1;
	else conditional += 1;
	lines.push(`${known.disposition.toUpperCase().padEnd(10)} ${name} (${advisories.length}, ${severities.join("/")})`);
	if (explain) {
		lines.push(`           ${known.why}`);
		lines.push(`           recheck: ${known.recheck}`);
	}
}

const title = `production advisory surface: ${Object.keys(report).length} package(s), ${active} active, ${conditional} conditional, ${blockNew} new`;
console.log(title);
for (const line of lines) console.log(`  ${line}`);
if (!explain) console.log("  (run with --explain for the reasoning)");

if (blockNew > 0) {
	console.error(`\n${blockNew} production advisor${blockNew === 1 ? "y" : "ies"} has no recorded disposition.`);
	console.error("Add it to KNOWN in tests/ci/audit-runtime.mjs with why it is active or conditional.");
	process.exitCode = 1;
}
