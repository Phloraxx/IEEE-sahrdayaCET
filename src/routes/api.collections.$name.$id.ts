/**
 * `GET|PATCH|DELETE /api/collections/:name/:id` — one record.
 *
 * Ownership is enforced in the WHERE clause, not by a post-fetch comparison, so
 * a "self" policy cannot be bypassed by guessing an id. A record the actor does
 * not own is reported as 404, not 403: telling a stranger that an id exists is
 * itself a disclosure.
 *
 * The detail read applies the same row visibility and the same column
 * projection as the list — a raw `SELECT *` here answered with columns the list
 * had just stripped.
 *
 * A mutation re-reads the row inside its own transaction through the same scoped
 * clause, and writes the audit pre-image from *that* read. Checking existence
 * before the transaction and trusting it afterwards left a window in which the
 * row could change (or be deleted and recreated) between the check and the
 * write, and the audit row described a row that was no longer there.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { getSessionUser } from "@/server/auth/session.server";
import { query, withTransaction } from "@/lib/db.server";
import { auditCollectionWrite } from "@/server/collections/audit";
import {
	COLLECTION_POLICIES,
	actorAllows,
	auditPreimage,
	canonicalWriteBody,
	hasFullVisibility,
	normaliseWriteBody,
	projectRow,
	resolveProjection,
	resolvePublicRead,
	sameFieldValue,
	tableColumns,
	updateEntries,
	validateWriteBody,
	type CollectionPolicy,
} from "@/server/collections/policy";
import { json, readJsonBody } from "@/server/http/api";

function notFound(): Response {
	return json({ error: "The requested resource wasn't found." }, 404);
}

function safeIdentifier(name: string, allowed: ReadonlySet<string>): string {
	if (!allowed.has(name) || !/^[a-z_][a-z0-9_]*$/.test(name)) {
		throw new Error(`Refusing unknown identifier: ${JSON.stringify(name)}`);
	}
	return `"${name}"`;
}

const TABLES = new Set(Object.values(COLLECTION_POLICIES).map((entry) => entry.table));

/**
 * Build the WHERE clause that scopes a single row to the actor.
 *
 * Identical to the list read: the static predicate, the publication policy, and
 * the unconditional owner scope. A detail read used to skip `publicRead`, so
 * `GET /api/collections/events/<draft-id>` returned an unpublished draft.
 */
function scopedWhere(
	policy: CollectionPolicy,
	actorId: string | null,
	publicRead: { sql: string; params: unknown[] } | null,
): { sql: string; params: unknown[] } {
	const parts = [`"id" = ?`];
	const params: unknown[] = [];
	if (policy.readPredicate) parts.push(`(${policy.readPredicate})`);
	if (publicRead) {
		parts.push(publicRead.sql);
		params.push(...publicRead.params);
	}
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
	const publicRead = await resolvePublicRead(policy, actor);
	const scope = scopedWhere(policy, actor?.id ?? null, publicRead);
	const result = await query<Record<string, unknown>>(
		`SELECT * FROM ${table} WHERE ${scope.sql}`,
		[id, ...scope.params],
	);

	const row = result.rows[0];
	if (!row) return notFound();
	const projection = resolveProjection(policy, await hasFullVisibility(policy, actor));
	return json(projectRow(row, projection));
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

	// See the list route: the audit log, outbox and waitlist are append-only
	// here because their owning command enforces the transitions.
	if (policy.genericWrite === false) {
		return json(
			{ error: "This collection is written by its own command", code: "GENERIC_WRITE_DISABLED" },
			405,
		);
	}

	const table = safeIdentifier(policy.table, TABLES);
	const columns = await tableColumns(policy.table);
	const publicRead = await resolvePublicRead(policy, actor);
	const scope = scopedWhere(policy, actor?.id ?? null, publicRead);
	const staff = await hasFullVisibility(policy, actor);
	const projection = resolveProjection(policy, staff);
	const actorId = actor?.id ?? null;

	const readScoped = () =>
		query<Record<string, unknown>>(`SELECT * FROM ${table} WHERE ${scope.sql}`, [id, ...scope.params]);

	if (request.method === "DELETE") {
		const deleted = await withTransaction(async () => {
			// The row is read inside the transaction: a foreign id (or a row this
			// actor may not touch) is a 404 here, and the audit image describes
			// the row that is actually removed.
			const existing = (await readScoped()).rows[0];
			if (!existing) return null;
			// Audit before the delete: event_id/registration_id are foreign keys
			// with ON DELETE SET NULL, and a row inserted afterwards would name a
			// parent that no longer exists.
			await auditCollectionWrite({
				actorId,
				collection: name,
				kind: "delete",
				row: auditPreimage(existing, policy, staff, []),
			});
			await query(`DELETE FROM ${table} WHERE "id" = ?`, [id]);
			return existing;
		});
		if (!deleted) return notFound();
		return new Response(null, { status: 204 });
	}

	if (request.method !== "PATCH") return json({ error: "Method not allowed" }, 405);

	const body = await readJsonBody(request);
	if (!body.ok) return json({ error: body.error, code: body.code }, body.status);

	// The client keeps PocketBase's field names; the write half of that
	// translation is validated here (an alias and its column that disagree are
	// a 400, not an arbitrary winner).
	const canonical = canonicalWriteBody(policy, body.body, columns);
	if (canonical.refused) {
		return json({ error: canonical.refused.error, code: canonical.refused.code }, canonical.refused.status);
	}
	if (!Object.keys(canonical.body).length) {
		return json({ error: "No writable fields supplied", code: "NO_WRITABLE_FIELDS" }, 400);
	}

	normaliseWriteBody(policy, canonical.body);
	const invalid = validateWriteBody(policy, canonical.body, columns);
	if (invalid) return json({ error: invalid.error, code: invalid.code }, invalid.status);

	const entries = updateEntries(policy, canonical.body, columns, staff);
	if (!entries?.length) {
		// Only a collection with no update allow-list is closed here. A write that
		// names only columns the policy keeps readonly is a bad request, not a
		// success: it says the client thinks it can change something it cannot.
		if (!policy.writableFields?.update?.length) {
			return json({ error: "This collection cannot be edited here", code: "GENERIC_WRITE_DISABLED" }, 405);
		}
		return json(
			{ error: "None of the supplied fields can be changed here", code: "NO_WRITABLE_FIELDS" },
			400,
		);
	}

	const assignments = entries
		.map(([key]) => `${safeIdentifier(key, columns)} = ?`)
		.join(", ");
	const values = entries.map(([, value]) => value);

	// pi-lens-ignore: sql-injection — every identifier here passed
	// safeIdentifier() (regex + live-schema allow-list); every value is bound.
	const result = await withTransaction(async () => {
		const existing = (await readScoped()).rows[0];
		if (!existing) return null;

		// A save that restates only the unchanged fields is what the admin forms
		// produce when nothing was edited. Answer with the row, but do not append
		// an audit row for a write that changes nothing.
		const changed = entries.filter(([key, value]) => !sameFieldValue(existing[key], value));

		await query(`UPDATE ${table} SET ${assignments} WHERE "id" = ?`, [...values, id]);

		const row = (await readScoped()).rows[0];
		if (!row) return null;
		if (changed.length) {
			const names = changed.map(([key]) => key);
			await auditCollectionWrite({
				actorId,
				collection: name,
				kind: "update",
				row,
				before: auditPreimage(existing, policy, staff, names),
				changed: names,
			});
		}
		return row;
	});
	if (!result) return notFound();
	return json(projectRow(result, projection));
}
