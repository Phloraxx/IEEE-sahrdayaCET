/**
 * Documentation check: live docs must link to real files, reference real
 * commands, and not repeat claims the system has outgrown.
 *
 * Historical, dated notes under docs/ are exempt from the stale-claim list —
 * they are records of what was true then. Their links are still checked.
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");
const problems = [];

const LIVE_DOCS = [
	"README.md",
	"AGENTS.md",
	"docs/architecture.md",
	"docs/security-architecture.md",
	"docs/deployment.md",
	"docs/release-checklist.md",
];

const STALE = [
	[/Vite 7\b/, "Vite is 8.3"],
	[/https?:\/\/[^\s)]*\/api\/health\b|\/api\/health\b/, "there is no /api/health route; use /healthz"],
	[/deploy\/staging/, "the deploy/staging ref is retired; staging deploys from the worktree"],
	[/DOCKPLOY_WEBHOOK_DEV/, "only DOCKPLOY_WEBHOOK_PROD remains"],
	[/dev\s*(?:→|->)\s*(?:CI\s*(?:→|->)\s*)?deploy\/staging|dev\s*(?:→|->)\s*staging/, "dev no longer deploys staging through CD"],
	[/\/api\s*(?:→|->)\s*PocketBase/, "the app server serves /api"],
	[/PocketBase API is an application security boundary/, "the app server is the boundary"],
	[/direct PocketBase OAuth/, "authentication is server-side Google OAuth with an opaque session cookie"],
	[/BlogPosting/, "the blog product was removed"],
	[/Content editors own their blog posts/, "the blog product was removed"],
	[/Blogs and societies also have stable/, "the blog product was removed"],
	[/POCKETBASE_INTERNAL_URL/, "public server reads query SQLite directly"],
];

function markdownFiles(dir) {
	const out = [];
	for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
		if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
		const rel = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...markdownFiles(rel));
		else if (entry.name.endsWith(".md")) out.push(rel);
	}
	return out;
}

const allDocs = [
	...["README.md", "AGENTS.md", "DESIGN.md", "PRODUCT.md"].filter((f) => existsSync(join(ROOT, f))),
	...markdownFiles("docs"),
];

// 1. Relative links resolve.
for (const file of allDocs) {
	const text = readFileSync(join(ROOT, file), "utf8");
	for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
		const target = match[1];
		if (/^(https?:|mailto:|#|\/\/)/.test(target)) continue;
		const clean = target.split("#")[0].split("?")[0];
		if (!clean) continue;
		const resolved = resolve(dirname(join(ROOT, file)), clean);
		if (!existsSync(resolved)) problems.push(`${file}: link target does not exist: ${target}`);
	}
}

// 2. Current docs do not repeat retired facts.
for (const file of LIVE_DOCS) {
	if (!existsSync(join(ROOT, file))) continue;
	const lines = readFileSync(join(ROOT, file), "utf8").split("\n");
	for (const [index, line] of lines.entries()) {
		// AGENTS.md is allowed to name a retired secret while documenting its retirement.
		if (file === "AGENTS.md" && /DOCKPLOY_WEBHOOK_DEV/.test(line) && /unused/i.test(line)) continue;
		for (const [pattern, why] of STALE) {
			if (pattern.test(line)) problems.push(`${file}:${index + 1}: ${why}\n    ${line.trim().slice(0, 160)}`);
		}
	}
}

// 3. Commands in the README exist.
const readme = readFileSync(join(ROOT, "README.md"), "utf8");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
for (const match of readme.matchAll(/bun run ([a-z][a-z0-9:-]*)/g)) {
	if (!pkg.scripts?.[match[1]]) problems.push(`README.md: unknown script "bun run ${match[1]}"`);
}
for (const match of readme.matchAll(/(scripts\/[A-Za-z0-9._/-]+)/g)) {
	const path = match[1].replace(/[.,)]$/, "");
	if (!existsSync(join(ROOT, path))) problems.push(`README.md: referenced path does not exist: ${path}`);
}

// 4. Skill files are well-formed.
const skillsDir = join(ROOT, ".opencode/skill");
if (existsSync(skillsDir)) {
	for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const file = join(skillsDir, entry.name, "SKILL.md");
		if (!existsSync(file)) {
			problems.push(`.opencode/skill/${entry.name}: missing SKILL.md`);
			continue;
		}
		const text = readFileSync(file, "utf8");
		if (!/^---\nname:.+\ndescription:.+\n---/s.test(text)) {
			problems.push(`.opencode/skill/${entry.name}/SKILL.md: missing name/description frontmatter`);
		}
	}
}

if (problems.length) {
	console.error(`Documentation check failed (${problems.length}):\n`);
	for (const problem of problems) console.error(`- ${problem}`);
	process.exit(1);
}
console.log(`Documentation check passed: ${allDocs.length} files, ${LIVE_DOCS.length} live docs.`);
