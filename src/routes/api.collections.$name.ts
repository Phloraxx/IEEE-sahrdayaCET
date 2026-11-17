/**
 * `GET|POST /api/collections/:name` — the generic collection endpoint.
 *
 * This is what replaced the browser's direct PocketBase collection access. It is
 * deliberately narrow: a collection must be listed in `COLLECTION_POLICIES`, the
 * filter grammar is small and compiled to parameterised SQL, and a "self" policy
 * is *always* filtered by its owner column so an admin capability cannot widen a
 * user-scoped query.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { getSessionUser } from "@/server/auth/session.server";
import { query } from "@/lib/db.server";
import {
	COLLECTION_POLICIES,
	actorAllows,
	tableColumns,
	translateFilter,
	translateSort,
} from "@/server/collections/policy";

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
	});
}

function badRequest(message: string): Response {
	return json({ error: message }, 400);
}

/**
 * Relationship names a client may expand, and where they point.
 *
 * Deliberately a fixed map rather than schema introspection: an expand is a join
 * across collections, and letting a caller name an arbitrary table would turn
 * this endpoint into a cross-collection reader.
 */
const EXPANDABLE: Record<string, { column: string; table: string }> = {
	society: { column: "society_id", table: "societies" },
	actor: { column: "actor_id", table: "users" },
	event: { column: "event_id", table: "events" },
	registration: { column: "registration_id", table: "registrations" },
	certificate: { column: "certificate_id", table: "certificates" },
};

/**
 * Attach `expand` objects to rows, PocketBase-style.
 *
 * Unknown names are ignored rather than rejected: the client sends a fixed set,
 * and a stale name should degrade to a flat row, not a 400 that breaks a page.
 */
async function expandRows(
	rows: Record<string, unknown>[],
	expand: string,
): Promise<Record<string, unknown>[]> {
	const names = expand
		.split(",")
		.map((name) => name.trim())
		.filter((name) => name && name in EXPANDABLE);
	if (!names.length || !rows.length) return rows;

	// Collect the ids per relationship, then fetch each table once.
	const idsByTable = new Map<string, Set<string>>();
	for (const name of names) {
		const spec = EXPANDABLE[name] as { column: string; table: string };
		const ids = idsByTable.get(spec.table) ?? new Set<string>();
		for (const row of rows) {
			const value = row[spec.column];
			if (typeof value === "string" && value) ids.add(value);
		}
		idsByTable.set(spec.table, ids);
	}

	const fetched = new Map<string, Map<string, Record<string, unknown>>>();
	for (const [table, ids] of idsByTable) {
		if (!ids.size) continue;
		const list = [...ids];
		const result = await query<Record<string, unknown>>(
			`SELECT * FROM "${table}" WHERE "id" IN (${list.map(() => "?").join(", ")})`,
			list,
		);
		fetched.set(table, new Map(result.rows.map((row) => [String(row.id), row])));
	}

	return rows.map((row) => {
		const expand: Record<string, unknown> = {};
		for (const name of names) {
			const spec = EXPANDABLE[name] as { column: string; table: string };
			const value = row[spec.column];
			if (typeof value !== "string" || !value) continue;
			const related = fetched.get(spec.table)?.get(value);
			if (related) expand[name] = related;
		}
		return Object.keys(expand).length ? { ...row, expand } : row;
	});
}

/**
 * Quote a column identifier.
 *
 * Every identifier reaching this function has already been checked against the
 * live table schema (`pragma_table_info`) and the policy allow-list, so it cannot
 * carry SQL. The pattern check is a second, independent guard: if a future caller
 * ever passes something unvalidated, this throws instead of interpolating.
 */
function safeIdentifier(name: string, allowed: ReadonlySet<string>): string {
	if (!allowed.has(name) || !/^[a-z_][a-z0-9_]*$/.test(name)) {
		throw new Error(`Refusing unknown identifier: ${JSON.stringify(name)}`);
	}
	return `"${name}"`;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
	const name = params.name ?? "";
	const policy = COLLECTION_POLICIES[name];
	if (!policy) return json({ error: "Unknown collection" }, 404);

	const context = await getSessionUser(request);
	const actor = context ? { id: context.user.id, role: context.user.role } : null;

	if (!(await actorAllows(policy.read, policy.readCapability, actor))) {
		return json({ error: "Not authorized" }, actor ? 403 : 401);
	}

	const url = new URL(request.url);
	const columns = await tableColumns(policy.table);

	const where: string[] = [];
	const bindings: unknown[] = [];

	// Visibility predicate first: it is not client-controllable.
	if (policy.readPredicate) where.push(`(${policy.readPredicate})`);

	// Self-scoping is unconditional for "self" policies.
	if (policy.read === "self" && policy.ownerColumn) {
		where.push(`"${policy.ownerColumn}" = ?`);
		bindings.push(actor?.id ?? "");
	}

	const filter = url.searchParams.get("filter");
	if (filter) {
		try {
			const translated = translateFilter(filter, columns);
			where.push(`(${translated.sql})`);
			bindings.push(...translated.params);
		} catch (error) {
			return badRequest((error as Error).message);
		}
	}

	let orderBy = "";
	const sort = url.searchParams.get("sort");
	if (sort) {
		try {
			orderBy = translateSort(sort, columns);
		} catch (error) {
			return badRequest((error as Error).message);
		}
	}

	const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
	const perPage = Math.min(500, Math.max(1, Number(url.searchParams.get("perPage") ?? 30) || 30));
	const skipTotal = url.searchParams.get("skipTotal") === "1";

	const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";
	const totalItems = skipTotal
		? -1
		: (
				await query<{ count: number }>(
					`SELECT COUNT(*) AS count FROM "${policy.table}"${whereSql}`,
					bindings,
				)
			).rows[0]?.count ?? 0;

	const rows = await query<Record<string, unknown>>(
		`SELECT * FROM "${policy.table}"${whereSql}${orderBy} LIMIT ? OFFSET ?`,
		[...bindings, perPage, (page - 1) * perPage],
	);

	// `expand` is applied after the page is read, so the join cost is bounded by
	// perPage rather than the table size.
	const expand = url.searchParams.get("expand") ?? "";
	const items = expand ? await expandRows(rows.rows, expand) : rows.rows;

	return json({
		page,
		perPage,
		totalItems,
		totalPages: totalItems < 0 ? -1 : Math.ceil(totalItems / perPage),
		items,
	});
}

export async function action({ request, params }: ActionFunctionArgs) {
	const name = params.name ?? "";
	const policy = COLLECTION_POLICIES[name];
	if (!policy) return json({ error: "Unknown collection" }, 404);
	if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

	const context = await getSessionUser(request);
	const actor = context ? { id: context.user.id, role: context.user.role } : null;

	if (!(await actorAllows(policy.write, policy.writeCapability, actor))) {
		return json({ error: "Not authorized" }, actor ? 403 : 401);
	}

	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return badRequest("Expected a JSON object");
	}

	const columns = await tableColumns(policy.table);
	const readonly = new Set(policy.readonlyColumns ?? []);
	const entries = Object.entries(body).filter(
		([key, value]) => columns.has(key) && !readonly.has(key) && value !== undefined,
	);

	if (!entries.length) return badRequest("No writable fields supplied");

	// A self-scoped create always belongs to the actor, whatever was posted.
	if (policy.write === "self" && policy.ownerColumn) {
		const forced = Object.fromEntries(entries.filter(([key]) => key !== policy.ownerColumn));
		forced[policy.ownerColumn] = actor?.id ?? "";
		entries.length = 0;
		entries.push(...Object.entries(forced));
	}

	const id = crypto.randomUUID();
	const names = ["id", ...entries.map(([key]) => key)];
	const values = [id, ...entries.map(([, value]) => value)];
	const placeholders = names.map(() => "?").join(", ");
	const columnList = names.map((column) => safeIdentifier(column, columns)).join(", ");
	const table = safeIdentifier(policy.table, new Set(Object.values(COLLECTION_POLICIES).map((entry) => entry.table)));

	// pi-lens-ignore: sql-injection — identifiers passed safeIdentifier()
	// (regex + live-schema allow-list); every value is bound.
	const created = await query<Record<string, unknown>>(
		`INSERT INTO ${table} (${columnList}) VALUES (${placeholders}) RETURNING *`,
		values,
	);
	return json(created.rows[0] ?? { id }, 201);
}
