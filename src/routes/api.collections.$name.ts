/**
 * `GET|POST /api/collections/:name` — the generic collection endpoint.
 *
 * This is what replaced the browser's direct PocketBase collection access. It is
 * deliberately narrow: a collection must be listed in `COLLECTION_POLICIES`, the
 * filter grammar is small and compiled to parameterised SQL, and a "self" policy
 * is *always* filtered by its owner column so an admin capability cannot widen a
 * user-scoped query.
 *
 * Reads are deny-by-default twice over: the WHERE clause decides which rows, and
 * the projection decides which columns. A reader without the collection's
 * full-visibility capability gets `publicFields` (or `publicOmit` removed), and
 * the same rule applies to the related rows an `expand` attaches — a `SELECT *`
 * joined into `expand` used to hand back a user's address columns.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { getSessionUser } from "@/server/auth/session.server";
import { query, withTransaction } from "@/lib/db.server";
import { auditCollectionWrite } from "@/server/collections/audit";
import {
	COLLECTION_POLICIES,
	actorAllows,
	actorReadScope,
	canonicalWriteBody,
	checkEventSocietyScope,
	createEntries,
	hasFullVisibility,
	normaliseWriteBody,
	projectRelated,
	projectRow,
	requiredColumns,
	resolveProjection,
	resolvePublicRead,
	tableColumns,
	translateFilter,
	translateSort,
	validateWriteBody,
	type CollectionPolicy,
	type ExpandSpec,
} from "@/server/collections/policy";
import { json, readJsonBody } from "@/server/http/api";

function badRequest(message: string, code = "INVALID_QUERY"): Response {
	return json({ error: message, code }, 400);
}

/**
 * Relationship names a client may expand, where they point, and what may be
 * returned about them.
 *
 * Deliberately a fixed map rather than schema introspection: an expand is a join
 * across collections, and letting a caller name an arbitrary table would turn
 * this endpoint into a cross-collection reader. Each entry carries its own
 * scoped visibility predicate *and* a positive list of display fields, so an
 * expand can never become a side door into a collection with no scoped read,
 * and never falls back to the source reader's deny-list. A target without both
 * is omitted from the response rather than served raw.
 *
 * The fields are the ones the browser actually renders:
 *   - `society` — id and name (event lists, the execom directory, the CSV export)
 *   - `actor`   — name and email (the dashboard's recent-activity attribution)
 *   - `event`   — title (the same attribution)
 * Client usage was verified before the map was narrowed; `registration` and
 * `certificate` had no caller and are gone.
 */
const EXPANDABLE: Record<string, ExpandSpec> = {
	society: {
		column: "society_id",
		table: "societies",
		policy: COLLECTION_POLICIES.societies,
		visibility: { sql: "is_hidden = 0", capability: "societies.edit" },
		fields: ["id", "name"],
	},
	actor: {
		column: "actor_id",
		table: "users",
		visibility: { sql: "1 = 1", capability: "reports.view" },
		fields: ["id", "name", "email"],
	},
	event: {
		column: "event_id",
		table: "events",
		policy: COLLECTION_POLICIES.events,
		visibility: { sql: "is_deleted = 0 AND status IN ('published', 'completed')", capability: "events.edit" },
		fields: ["id", "title"],
	},
};

/**
 * How many relations an expand may attach. The related fetch is one query per
 * table, so the cap bounds both the placeholder list and the response size; the
 * client sends at most two names.
 */
const MAX_EXPAND_NAMES = 3;

/**
 * Attach `expand` objects to rows, PocketBase-style.
 *
 * Unknown names are ignored rather than rejected: the client sends a fixed set,
 * and a stale name should degrade to a flat row, not a 400 that breaks a page.
 * Every related fetch is filtered by that relation's own visibility predicate
 * and reduced to its display fields, so a row the reader may not see is absent
 * from `expand` and a column outside the summary is never returned.
 */
async function expandRows(
	rows: Record<string, unknown>[],
	expand: string,
	actor: { id: string; role: string } | null,
	staff: boolean,
): Promise<Record<string, unknown>[]> {
	const names = expand
		.split(",")
		.map((name) => name.trim())
		.filter((name): name is string => Boolean(name) && name in EXPANDABLE)
		.slice(0, MAX_EXPAND_NAMES);
	if (!names.length || !rows.length) return rows;

	// One request-wide visibility per relation name: the predicate comes from
	// the reader's assignments, never from the request.
	const visibility = new Map<string, { sql: string; params: unknown[] } | null>();
	for (const name of names) {
		const spec = EXPANDABLE[name] as ExpandSpec;
		visibility.set(name, await expandVisibility(spec, actor));
	}

	// Collect the ids per relation, then fetch each table once.
	const idsByRelation = new Map<string, Set<string>>();
	for (const name of names) {
		const spec = EXPANDABLE[name] as ExpandSpec;
		const ids = new Set<string>();
		for (const row of rows) {
			const value = row[spec.column];
			if (typeof value === "string" && value) ids.add(value);
		}
		idsByRelation.set(name, ids);
	}

	const fetched = new Map<string, Map<string, Record<string, unknown>>>();
	for (const name of names) {
		const ids = idsByRelation.get(name) ?? new Set<string>();
		const scope = visibility.get(name);
		if (!ids.size || !scope) continue;
		const spec = EXPANDABLE[name] as ExpandSpec;
		const list = [...ids];
		const result = await query<Record<string, unknown>>(
			`SELECT * FROM "${spec.table}" WHERE "id" IN (${list.map(() => "?").join(", ")}) AND (${scope.sql})`,
			[...list, ...scope.params],
		);
		fetched.set(name, new Map(result.rows.map((row) => [String(row.id), row])));
	}

	return rows.map((row) => {
		const expand: Record<string, Record<string, unknown>> = {};
		for (const name of names) {
			const spec = EXPANDABLE[name] as ExpandSpec;
			const value = row[spec.column];
			if (typeof value !== "string" || !value) continue;
			const related = fetched.get(name)?.get(value);
			if (!related) continue;
			const summary = projectRelated(related, spec, staff);
			if (summary) expand[name] = summary;
		}
		return Object.keys(expand).length ? { ...row, expand } : row;
	});
}

/**
 * The predicate a related fetch must satisfy: the spec's static clause, or the
 * target collection's publication predicate when the actor does not hold its
 * bypass capability. `null` means "do not attach this relation".
 */
async function expandVisibility(
	spec: ExpandSpec,
	actor: { id: string; role: string } | null,
): Promise<{ sql: string; params: unknown[] } | null> {
	const config = spec.visibility;
	if (!config) return null;
	if (actor && (await actorAllows("capability", config.capability, actor))) {
		return { sql: config.sql, params: [] };
	}
	// Non-staff readers get the public half plus their own scoped rows, exactly
	// as the source collection's own read does.
	const policy: CollectionPolicy = spec.policy ?? {
		table: spec.table,
		read: "capability",
		write: "capability",
		publicRead: { sql: config.sql, capability: config.capability },
	};
	const publicRead = await resolvePublicRead(policy, actor);
	if (!publicRead) return { sql: config.sql, params: [] };
	return publicRead;
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

/**
 * Columns a client may filter or sort by: the ones it can read.
 *
 * A hidden column used to be queryable — `filter=finance_approval_status='approved'`
 * told an anonymous visitor which events were finance-approved, and a
 * registration's `user_email` was an undocumented search oracle. Restricting the
 * grammar to the readable projection closes both without a second list to keep.
 */
function readableColumns(
	columns: ReadonlySet<string>,
	projection: ReturnType<typeof resolveProjection>,
): ReadonlySet<string> {
	if (!projection.columns) return columns;
	return new Set([...columns].filter((column) => projection.columns?.has(column)));
}

export async function loader({ request, params }: LoaderFunctionArgs) {
	const name = params.name ?? "";
	const policy = COLLECTION_POLICIES[name];
	if (!policy) return json({ error: "Unknown collection" }, 404);

	const context = await getSessionUser(request);
	const actor = context ? { id: context.user.id, role: context.user.role } : null;

	// Branch-wide access, or — for the reporting collections PocketBase allowed a
	// scoped read on — a predicate built from the actor's own assignments.
	let scoped: { sql: string; params: unknown[] } | null = null;
	if (!(await actorAllows(policy.read, policy.readCapability, actor))) {
		if (policy.scopedRead && actor) {
			const scope = await actorReadScope(actor, policy.scopedRead.capability);
			if (scope) scoped = policy.scopedRead.predicate(scope);
		}
		if (!scoped) return json({ error: "Not authorized" }, actor ? 403 : 401);
	}

	const url = new URL(request.url);
	const columns = await tableColumns(policy.table);
	const staff = await hasFullVisibility(policy, actor);
	const projection = resolveProjection(policy, staff);
	const readable = readableColumns(columns, projection);

	const where: string[] = [];
	const bindings: unknown[] = [];

	// Visibility predicate first: it is not client-controllable.
	if (policy.readPredicate) where.push(`(${policy.readPredicate})`);
	const publicRead = await resolvePublicRead(policy, actor);
	if (publicRead) {
		where.push(publicRead.sql);
		bindings.push(...publicRead.params);
	}
	if (scoped) {
		where.push(`(${scoped.sql})`);
		bindings.push(...scoped.params);
	}

	// Self-scoping is unconditional for "self" policies.
	if (policy.read === "self" && policy.ownerColumn) {
		where.push(`"${policy.ownerColumn}" = ?`);
		bindings.push(actor?.id ?? "");
	}

	const filter = url.searchParams.get("filter");
	if (filter) {
		try {
			const translated = translateFilter(filter, readable, policy.aliases);
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
			orderBy = translateSort(sort, readable, policy.aliases);
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
	const expanded = expand ? await expandRows(rows.rows, expand, actor, staff) : rows.rows;

	// Readers without the staff capability get the allow-listed projection: a
	// bare `SELECT *` used to hand back the approval trail, the finance sign-off,
	// the attendance snapshot, and every execom member's phone number.
	const items = expanded.map((row) => {
		const related = (row.expand ?? null) as Record<string, Record<string, unknown>> | null;
		return projectRow(row, projection, related);
	});

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
	const policy: CollectionPolicy | undefined = COLLECTION_POLICIES[name];
	if (!policy) return json({ error: "Unknown collection" }, 404);
	if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

	const context = await getSessionUser(request);
	const actor = context ? { id: context.user.id, role: context.user.role } : null;

	if (!(await actorAllows(policy.write, policy.writeCapability, actor))) {
		return json({ error: "Not authorized" }, actor ? 403 : 401);
	}

	// The audit log, the outbox and the waitlist are written by the command that
	// owns them. A reporting capability used to be enough to append a forged
	// audit row or delete the trail, and a member could accept their own
	// waitlist seat.
	if (policy.genericWrite === false) {
		return json(
			{ error: "This collection is written by its own command", code: "GENERIC_WRITE_DISABLED" },
			405,
		);
	}

	const parsed = await readJsonBody(request);
	if (!parsed.ok) return json({ error: parsed.error, code: parsed.code }, parsed.status);
	const body = parsed.body;

	const columns = await tableColumns(policy.table);
	// The client keeps PocketBase's field names; the write half of that
	// translation is validated here (an alias and its column that disagree are
	// a 400, not an arbitrary winner).
	const canonical = canonicalWriteBody(policy, body, columns);
	if (canonical.refused) {
		return json({ error: canonical.refused.error, code: canonical.refused.code }, canonical.refused.status);
	}
	normaliseWriteBody(policy, canonical.body);
	const invalid = validateWriteBody(policy, canonical.body, columns);
	if (invalid) return json({ error: invalid.error, code: invalid.code }, invalid.status);

	const staff = await hasFullVisibility(policy, actor);
	const entries = createEntries(policy, canonical.body, columns);
	if (!entries) {
		// No `writableFields.create`: this collection is not created through the
		// generic surface (assignments, profiles of an account, …).
		return json({ error: "This collection is not created here", code: "GENERIC_WRITE_DISABLED" }, 405);
	}

	if (!entries.length) return badRequest("No writable fields supplied", "NO_WRITABLE_FIELDS");

	// A required column the body left out (or set to null) is the caller's error,
	// not a constraint failure: without this the INSERT answered 500 with
	// `NOT NULL constraint failed: events.title`.
	const supplied = new Set(entries.filter(([, value]) => value !== null && value !== undefined).map(([key]) => key));
	const defaults = new Set(Object.keys(policy.createDefaults ?? {}));
	const missing = (await requiredColumns(policy.table)).filter(
		(column) => !supplied.has(column) && !defaults.has(column),
	);
	if (missing.length) {
		return badRequest(`${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} required`, "INVALID_FIELD");
	}

	// A draft may only be filed under a society the actor organises.
	const outOfScope = await checkEventSocietyScope(policy, entries, actor);
	if (outOfScope) return json({ error: outOfScope.error, code: outOfScope.code }, outOfScope.status);

	// An event may be created without a host society: nine legacy rows have
	// none, and the public event page renders without one. Inserting NULL is
	// what keeps the foreign key satisfied when the form sends no society.
	if (policy.table === "events" && !entries.some(([key]) => key === "society_id")) {
		entries.push(["society_id", null]);
	}

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
	const created = await withTransaction(async () => {
		const inserted = await query<Record<string, unknown>>(
			`INSERT INTO ${table} (${columnList}) VALUES (${placeholders}) RETURNING *`,
			values,
		);
		const row = inserted.rows[0] ?? { id };
		await auditCollectionWrite({ actorId: actor?.id ?? null, collection: name, kind: "create", row });
		return row;
	});
	return json(projectRow(created, resolveProjection(policy, staff)), 201);
}
