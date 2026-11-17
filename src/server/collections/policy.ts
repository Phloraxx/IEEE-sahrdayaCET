/**
 * Collection access policy and filter translation.
 *
 * The browser client keeps a PocketBase-shaped surface (`collection("events")
 * .getList({ filter, sort, expand })`), so this module turns that surface into
 * parameterised SQL. Two rules keep it safe:
 *
 *   1. **Allow-list.** A collection that is not listed cannot be read or written
 *      through this endpoint at all.
 *   2. **Fail closed.** The filter translator understands a small grammar and
 *      rejects anything else with a 400. It never passes text through to SQL.
 *
 * Column names are validated against the real table schema, so even a crafted
 * field name cannot reach the query.
 */

import { query } from "@/lib/db.server";
import { hasCapability, type Actor, type Assignment, type Capability } from "@/server/authz/capabilities";

export type Access = "public" | "self" | "capability";

export interface CollectionPolicy {
	table: string;
	/** Who may read. */
	read: Access;
	/** Who may write (create/update/delete). */
	write: Access;
	/** Capability required when `read`/`write` is "capability". */
	readCapability?: Capability;
	writeCapability?: Capability;
	/** Extra SQL predicate applied to every read (visibility rules). */
	readPredicate?: string;
	/** Columns a client may never write. */
	readonlyColumns?: readonly string[];
	/**
	 * Column that ties a row to its owner, for `read: "self"` / `write: "self"`.
	 *
	 * This is what keeps an admin capability from widening a user-scoped query:
	 * a "self" policy is *always* filtered by this column, whatever the actor's
	 * capabilities are.
	 */
	ownerColumn?: string;
}

/** The collections the browser may touch, and under what terms. */
export const COLLECTION_POLICIES: Record<string, CollectionPolicy> = {
	events: {
		table: "events",
		read: "public",
		write: "capability",
		writeCapability: "events.edit",
		readPredicate: "is_deleted = 0",
		readonlyColumns: ["registered_count", "checked_in_count", "is_deleted"],
	},
	societies: {
		table: "societies",
		read: "public",
		write: "capability",
		writeCapability: "societies.edit",
	},
	blogs: {
		table: "blogs",
		read: "public",
		write: "capability",
		writeCapability: "content.manage",
	},
	execom: {
		table: "execom",
		read: "public",
		write: "capability",
		writeCapability: "execom.manage",
	},
	users: {
		table: "users",
		read: "self",
		write: "self",
		ownerColumn: "id",
		readonlyColumns: ["role", "google_sub", "email_verified"],
	},
	registrations: {
		table: "registrations",
		read: "self",
		write: "capability",
		writeCapability: "registrations.manage",
		readonlyColumns: ["ticket_id", "payment_status", "final_fee_paise"],
	},
	organization_assignments: {
		table: "organization_assignments",
		read: "self",
		write: "capability",
		writeCapability: "assignments.manage",
		ownerColumn: "user_id",
	},
	event_waitlist: {
		table: "event_waitlist",
		read: "self",
		write: "self",
		ownerColumn: "user_id",
	},
	community_profiles: {
		table: "community_profiles",
		read: "self",
		write: "self",
		ownerColumn: "user_id",
	},
	coupons: {
		table: "coupons",
		read: "capability",
		readCapability: "events.edit",
		write: "capability",
		writeCapability: "events.edit",
	},
	admin_audit_log: {
		table: "admin_audit_log",
		read: "capability",
		readCapability: "reports.view",
		write: "capability",
		writeCapability: "reports.view",
	},
};

// ---------------------------------------------------------------------------
// Filter translation
// ---------------------------------------------------------------------------

const OPERATORS: Record<string, string> = {
	"=": "=",
	"!=": "<>",
	">": ">",
	">=": ">=",
	"<": "<",
	"<=": "<=",
};

interface Token {
	kind: "field" | "op" | "value" | "and" | "or" | "lparen" | "rparen";
	text: string;
}

function tokenize(filter: string): Token[] {
	const tokens: Token[] = [];
	let index = 0;

	while (index < filter.length) {
		const char = filter[index] as string;

		if (/\s/.test(char)) {
			index += 1;
			continue;
		}
		if (char === "(") {
			tokens.push({ kind: "lparen", text: "(" });
			index += 1;
			continue;
		}
		if (char === ")") {
			tokens.push({ kind: "rparen", text: ")" });
			index += 1;
			continue;
		}
		if (filter.startsWith("&&", index) || filter.startsWith("||", index)) {
			tokens.push({ kind: filter.startsWith("&&", index) ? "and" : "or", text: filter.slice(index, index + 2) });
			index += 2;
			continue;
		}
		if (char === "'") {
			// Quoted string; '' is an escaped quote.
			let value = "";
			index += 1;
			while (index < filter.length) {
				if (filter[index] === "'") {
					if (filter[index + 1] === "'") {
						value += "'";
						index += 2;
						continue;
					}
					index += 1;
					break;
				}
				value += filter[index];
				index += 1;
			}
			tokens.push({ kind: "value", text: value });
			continue;
		}
		// Operator or bare word/number.
		const operatorMatch = /^(>=|<=|!=|=|>|<)/.exec(filter.slice(index));
		if (operatorMatch) {
			tokens.push({ kind: "op", text: operatorMatch[1] as string });
			index += operatorMatch[1]!.length;
			continue;
		}
		const wordMatch = /^[A-Za-z0-9_.-]+/.exec(filter.slice(index));
		if (wordMatch) {
			const text = wordMatch[0];
			// A word followed by an operator is a field; otherwise it is a value.
			const rest = filter.slice(index + text.length).trimStart();
			const isField = /^(=|!=|>=|<=|>|<)/.test(rest);
			tokens.push({ kind: isField ? "field" : "value", text });
			index += text.length;
			continue;
		}
		throw new Error(`Unsupported filter token near "${filter.slice(index, index + 12)}"`);
	}
	return tokens;
}

export interface TranslatedFilter {
	sql: string;
	params: unknown[];
}

/**
 * Translate a PocketBase-style filter into SQL.
 *
 * Supports `field <op> value` joined by `&&` / `||` and parentheses. Field names
 * are validated against `allowedColumns`; values are always bound.
 */
export function translateFilter(
	filter: string,
	allowedColumns: ReadonlySet<string>,
): TranslatedFilter {
	const tokens = tokenize(filter);
	const params: unknown[] = [];
	let position = 0;

	function parseExpression(): string {
		let left = parseTerm();
		while (tokens[position]?.kind === "or") {
			position += 1;
			const right = parseTerm();
			left = `(${left} OR ${right})`;
		}
		return left;
	}

	function parseTerm(): string {
		let left = parseFactor();
		while (tokens[position]?.kind === "and") {
			position += 1;
			const right = parseFactor();
			left = `(${left} AND ${right})`;
		}
		return left;
	}

	function parseFactor(): string {
		const token = tokens[position];
		if (token?.kind === "lparen") {
			position += 1;
			const inner = parseExpression();
			if (tokens[position]?.kind !== "rparen") throw new Error("Unbalanced filter parentheses");
			position += 1;
			return inner;
		}

		const field = tokens[position];
		const op = tokens[position + 1];
		const value = tokens[position + 2];
		if (field?.kind !== "field" || op?.kind !== "op" || value?.kind !== "value") {
			throw new Error("Unsupported filter expression");
		}
		position += 3;

		const column = field.text.replace(/([A-Z])/g, "_$1").toLowerCase();
		if (!allowedColumns.has(column)) {
			throw new Error(`Unknown filter field: ${field.text}`);
		}

		const sqlOp = OPERATORS[op.text];
		if (!sqlOp) throw new Error(`Unsupported operator: ${op.text}`);

		let bound: unknown = value.text;
		if (bound === "true") bound = 1;
		else if (bound === "false") bound = 0;
		else if (/^-?\d+$/.test(String(bound))) bound = Number(bound);

		params.push(bound);
		return `"${column}" ${sqlOp} ?`;
	}

	const sql = parseExpression();
	if (position !== tokens.length) throw new Error("Trailing tokens in filter");
	return { sql, params };
}

/** Sort: `-field` is descending; validated against the column set. */
export function translateSort(sort: string, allowedColumns: ReadonlySet<string>): string {
	const parts = sort
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean)
		.map((part) => {
			const descending = part.startsWith("-");
			const raw = descending ? part.slice(1) : part;
			const column = raw.replace(/([A-Z])/g, "_$1").toLowerCase();
			if (!allowedColumns.has(column)) throw new Error(`Unknown sort field: ${raw}`);
			return `"${column}" ${descending ? "DESC" : "ASC"}`;
		});
	if (!parts.length) return "";
	return ` ORDER BY ${parts.join(", ")}`;
}

/** The columns that actually exist on a table. */
export async function tableColumns(table: string): Promise<Set<string>> {
	const result = await query<{ name: string }>(
		"SELECT name FROM pragma_table_info(?)",
		[table],
	);
	return new Set(result.rows.map((row) => row.name));
}

/** Resolve the actor's assignments for capability checks. */
export async function actorAssignments(userId: string): Promise<Assignment[]> {
	const result = await query<{
		id: string;
		user_id: string;
		role_code: string;
		scope_type: string;
		society_id: string | null;
		event_id: string | null;
		active: number;
		starts_at: string | null;
		ends_at: string | null;
		source: string | null;
	}>(
		`SELECT id, user_id, role_code, scope_type, society_id, event_id, active, starts_at, ends_at, source
		   FROM organization_assignments WHERE user_id = ? AND active = 1`,
		[userId],
	);
	return result.rows.map((row) => ({
		id: row.id,
		userId: row.user_id,
		roleCode: row.role_code,
		scopeType: row.scope_type,
		societyId: row.society_id,
		eventId: row.event_id,
		active: row.active === 1,
		startsAt: row.starts_at,
		endsAt: row.ends_at,
		source: row.source,
	}));
}

/** Does the actor satisfy this access level? */
export async function actorAllows(
	access: Access,
	capability: Capability | undefined,
	actor: Actor | null,
): Promise<boolean> {
	if (access === "public") return true;
	if (!actor) return false;
	if (access === "self") return true;
	if (!capability) return false;
	const assignments = await actorAssignments(actor.id);
	return hasCapability(actor, capability, {}, assignments);
}
