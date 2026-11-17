import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Every `/api/...` path the browser calls must exist in `src/routes.ts`.
 *
 * This is the test that would have caught the eight endpoints the port never
 * grew — the ticket page, waitlist, coupons, private details, the notification
 * panel and payment reconcile all called routes that answered 404. A page that
 * renders its header while its data call 404s looks fine to a smoke test, so
 * the check has to be structural.
 */

function walk(dir: string, acc: string[] = []): string[] {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) walk(path, acc);
		else if (/\.(ts|tsx)$/.test(entry.name)) acc.push(path);
	}
	return acc;
}

/** Strip comments so a path mentioned in prose is not treated as a call. */
function stripComments(source: string): string {
	return source
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** `/api/admin/events/${encodeURIComponent(id)}/archive` -> `/api/admin/events/:p/archive` */
function normalize(raw: string): string {
	let out = "";
	let index = 0;
	while (index < raw.length) {
		if (raw[index] === "$" && raw[index + 1] === "{") {
			let depth = 1;
			index += 2;
			while (index < raw.length && depth > 0) {
				if (raw[index] === "{") depth += 1;
				else if (raw[index] === "}") depth -= 1;
				index += 1;
			}
			out += ":p";
			continue;
		}
		out += raw[index];
		index += 1;
	}
	return out
		.replace(/^\/api\/app\//, "/api/")
		.replace(/\?.*$/, "")
		.replace(/\/$/, "");
}

function clientPaths(): Map<string, string> {
	const found = new Map<string, string>();
	for (const file of [...walk(resolve("src/lib")), ...walk(resolve("src/features"))]) {
		const source = stripComments(readFileSync(file, "utf8"));
		for (const match of source.matchAll(/["`](\/api\/[^"`]*)["`]/g)) {
			const raw = match[1] as string;
			// Skip glob-ish documentation strings and the bare prefix.
			if (raw.includes("*") || raw.includes("...") || raw === "/api/") continue;
			const path = normalize(raw);
			if (!path.startsWith("/api/") || path.split("/").length < 3) continue;
			if (!found.has(path)) found.set(path, file.replace(process.cwd() + "/", ""));
		}
	}
	return found;
}

function declaredRoutes(): string[] {
	const source = readFileSync(resolve("src/routes.ts"), "utf8");
	return [...source.matchAll(/route\(\s*"([^"]+)"/g)].map(
		(match) => `/${(match[1] as string).replace(/:[A-Za-z]+/g, ":p")}`,
	);
}

function resolves(path: string, declared: string[]): boolean {
	const parts = path.split("/");
	for (const route of declared) {
		const routeParts = route.split("/");
		if (routeParts.length !== parts.length) continue;
		let ok = true;
		for (let i = 0; i < parts.length; i += 1) {
			if (routeParts[i] === ":p" || parts[i] === ":p") continue;
			if (routeParts[i] !== parts[i]) {
				ok = false;
				break;
			}
		}
		if (ok) return true;
	}
	return false;
}

describe("client route coverage", () => {
	it("resolves every /api path the client calls to a declared route", () => {
		const declared = declaredRoutes();
		const missing = [...clientPaths().entries()]
			.filter(([path]) => !resolves(path, declared))
			.map(([path, file]) => `${path}  (called from ${file})`)
			.sort();
		expect(missing, "client calls with no server route").toEqual([]);
	});

	it("finds a meaningful number of client paths", () => {
		// Guards against the extractor silently matching nothing after a refactor.
		expect(clientPaths().size).toBeGreaterThan(30);
	});
});
