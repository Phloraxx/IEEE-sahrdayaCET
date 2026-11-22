/**
 * Audit rows for the generic collection surface.
 *
 * `/api/collections/:name` is how the admin UI saves societies, execom members,
 * events and coupons. Those writes used to leave no trace, so "Recent admin
 * activity" only showed workflow, certificate, check-in and role actions. This
 * maps a collection write onto the same `admin_audit_log` shape, with only the
 * changed columns in `before`/`after` for an edit.
 *
 * The mapping is pure so it can be unit-tested; `auditCollectionWrite` is the
 * thin database call the routes use inside their transaction.
 */

import { audit, type AuditInput } from "@/server/audit";

/** Collection name -> the entity name the audit log and dashboard display. */
const ENTITY_TYPES: Readonly<Record<string, string>> = {
	events: "event",
	societies: "society",
	execom: "execom_member",
	users: "user",
	coupons: "coupon",
	certificates: "certificate",
	admin_audit_log: "admin_audit_log",
	notification_outbox: "notification",
	organization_assignments: "assignment",
	event_waitlist: "waitlist_entry",
	community_profiles: "community_profile",
};

/** Values that identify a person but are not needed to explain a change. */
const REDACTED = new Set(["google_sub"]);

export type CollectionWriteKind = "create" | "update" | "delete";

export interface CollectionWriteAuditInput {
	actorId: string | null;
	collection: string;
	kind: CollectionWriteKind;
	/** The row after the write (create/update) or the row being removed. */
	row: Record<string, unknown>;
	/** The row before an update. */
	before?: Record<string, unknown>;
	/** Columns an update actually changed. */
	changed?: string[];
}

function entityType(collection: string): string {
	return ENTITY_TYPES[collection] ?? collection.replace(/ies$/, "y").replace(/s$/, "");
}

function snapshot(row: Record<string, unknown> | undefined, keys: Iterable<string>): Record<string, unknown> | undefined {
	if (!row) return undefined;
	const picked: Record<string, unknown> = {};
	for (const key of keys) {
		if (!(key in row)) continue;
		picked[key] = REDACTED.has(key) ? "[redacted]" : row[key];
	}
	return Object.keys(picked).length ? picked : undefined;
}

/** The audit row a collection write should append. */
export function collectionAuditInput(input: CollectionWriteAuditInput): AuditInput {
	const entity = entityType(input.collection);
	const id = String(input.row.id ?? "");
	const eventId =
		input.collection === "events"
			? id
			: typeof input.row.event_id === "string"
				? input.row.event_id
				: null;
	const registrationId =
		input.collection === "registrations"
			? id
			: typeof input.row.registration_id === "string"
				? input.row.registration_id
				: null;

	const changed = input.changed?.filter((key) => key !== "updated_at") ?? [];
	const note =
		input.kind === "create"
			? `Created ${entity}`
			: input.kind === "delete"
				? `Deleted ${entity}`
				: `Updated ${changed.length ? changed.join(", ") : entity}`;

	return {
		actorId: input.actorId,
		action: `${entity}.${input.kind}`,
		entityType: entity,
		entityId: id,
		eventId,
		registrationId,
		note,
		before:
			input.kind === "update"
				? snapshot(input.before, changed)
				: input.kind === "delete"
					? snapshot(input.row, Object.keys(input.row))
					: undefined,
		after:
			input.kind === "update"
				? snapshot(input.row, changed)
				: input.kind === "create"
					? snapshot(input.row, Object.keys(input.row))
					: undefined,
		outcome: "success",
	};
}

/** Append the audit row. Call inside the caller's transaction. */
export async function auditCollectionWrite(input: CollectionWriteAuditInput): Promise<void> {
	await audit(collectionAuditInput(input));
}
