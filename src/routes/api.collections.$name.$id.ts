/**
 * `GET|PATCH|DELETE /api/collections/:name/:id` — one record.
 *
 * Ownership is enforced in the WHERE clause, not by a post-fetch comparison, so
 * a "self" policy cannot be bypassed by guessing an id. A record the actor does
 * not own is reported as 404, not 403: telling a stranger that an id exists is
 * itself a disclosure.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { getSessionUser } from "@/server/auth/session.server";
import { query } from "@/lib/db.server";
import {
	COLLECTION_POLICIES,
	actorAllows,
	tableColumns,
} from "@/server/collections/policy";

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
	});
}

function safeIdentifier(name: string, allowed: ReadonlySet<string>): string {
	if (!allowed.has(name) || !/^[a-z_][a-z0-9_]*$/.test(name)) {
		throw new Error(`Refusing unknown identifier: ${JSON.stringify(name)}`);
	}
	return `"${name}"`;
}

const TABLES = new Set(Object.values(COLLECTION_POLICIES).map((entry) => entry.table));

/** Build the WHERE clause that scopes a single row to the actor. */
function scopedWhere(
	policy: (typeof COLLECTION_POLICIES)[string],
	actorId: string | null,
): { sql: string; params: unknown[] } {
	const parts = [`"id" = ?`];
	const params: unknown[] = [];
	if (policy.readPredicate) parts.push(`(${policy.readPredicate})`);
	if (policy.read === "self" && policy.ownerColumn) {
		parts.push(`"${policy.ownerColumn}" = ?`);
		params.push(actorId ?? "");
	}
	return { sql: parts.join(" AND "), params };
}

export async function loader({ request, params }: LoaderFunctionArgs) {
	const name = params.name ?? "";
	const id = params.id ?? "";
	const policy = COLLECTION_POLICIES[name];
	if (!policy) return json({ error: "Unknown collection" }, 404);

	const context = await getSessionUser(request);
	const actor = context ? { id: context.user.id, role: context.user.role } : null;
	if (!(await actorAllows(policy.read, policy.readCapability, actor))) {
		return json({ error: "Not authorized" }, actor ? 403 : 401);
	}

	const table = safeIdentifier(policy.table, TABLES);
	const scope = scopedWhere(policy, actor?.id ?? null);
	const result = await query<Record<string, unknown>>(
		`SELECT * FROM ${table} WHERE ${scope.sql}`,
		[id, ...scope.params],
	);

	const row = result.rows[0];
	if (!row) return json({ error: "The requested resource wasn't found." }, 404);
	return json(row);
}

export async function action({ request, params }: ActionFunctionArgs) {
	const name = params.name ?? "";
	const id = params.id ?? "";
	const policy = COLLECTION_POLICIES[name];
	if (!policy) return json({ error: "Unknown collection" }, 404);

	const context = await getSessionUser(request);
	const actor = context ? { id: context.user.id, role: context.user.role } : null;
	if (!(await actorAllows(policy.write, policy.writeCapability, actor))) {
		return json({ error: "Not authorized" }, actor ? 403 : 401);
	}

	const table = safeIdentifier(policy.table, TABLES);
	const columns = await tableColumns(policy.table);
	const scope = scopedWhere(policy, actor?.id ?? null);

	// Existence is checked through the scoped clause, so a foreign id is a 404.
	const existing = await query<{ id: string }>(
		`SELECT "id" FROM ${table} WHERE ${scope.sql}`,
		[id, ...scope.params],
	);
	if (!existing.rows[0]) return json({ error: "The requested resource wasn't found." }, 404);

	if (request.method === "DELETE") {
		await query(`DELETE FROM ${table} WHERE "id" = ?`, [id]);
		return new Response(null, { status: 204 });
	}

	if (request.method !== "PATCH") return json({ error: "Method not allowed" }, 405);

	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return json({ error: "Expected a JSON object" }, 400);
	}

	const readonly = new Set(policy.readonlyColumns ?? []);
	const entries = Object.entries(body).filter(
		([key, value]) => columns.has(key) && !readonly.has(key) && key !== "id" && value !== undefined,
	);
	if (!entries.length) return json({ error: "No writable fields supplied" }, 400);

	const assignments = entries
		.map(([key]) => `${safeIdentifier(key, columns)} = ?`)
		.join(", ");
	const values = entries.map(([, value]) => value);

	// pi-lens-ignore: sql-injection — every identifier here passed
	// safeIdentifier() (regex + live-schema allow-list); every value is bound.
	const updated = await query<Record<string, unknown>>(
		`UPDATE ${table} SET ${assignments} WHERE "id" = ? RETURNING *`,
		[...values, id],
	);
	return json(updated.rows[0] ?? { id });
}
