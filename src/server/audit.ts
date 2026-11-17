/**
 * Admin audit trail.
 *
 * Ported from `admin-operations-helpers.js#audit`. Every privileged mutation
 * writes a row here, inside the same transaction as the change it describes, so
 * the log cannot disagree with the data.
 *
 * The PocketBase version tolerated a missing collection (it returned early). That
 * tolerance is gone: the table is part of the schema, and silently dropping an
 * audit row is worse than failing the request.
 */

import { query } from "@/lib/db.server";

export interface AuditInput {
	actorId: string;
	action: string;
	eventId?: string | null;
	registrationId?: string | null;
	entityType?: string;
	entityId?: string;
	note?: string;
	before?: unknown;
	after?: unknown;
	outcome?: "success" | "failure";
	requestId?: string;
}

function clip(value: string | undefined, max: number): string {
	return (value ?? "").slice(0, max);
}

function serialise(value: unknown): string | null {
	if (value === undefined || value === null) return null;
	try {
		return JSON.stringify(value);
	} catch {
		return null;
	}
}

/** Append one audit row. Call inside the caller's transaction. */
export async function audit(input: AuditInput): Promise<void> {
	const entityType = clip(
		input.entityType ?? (input.registrationId ? "registration" : input.eventId ? "event" : ""),
		80,
	);
	const entityId = clip(
		input.entityId ?? input.registrationId ?? input.eventId ?? "",
		80,
	);

	await query(
		`INSERT INTO admin_audit_log
		   (id, event_id, registration_id, actor_id, action, note, before, after,
		    entity_type, entity_id, outcome, request_id, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		[
			crypto.randomUUID(),
			input.eventId ?? null,
			input.registrationId ?? null,
			input.actorId,
			clip(input.action || "admin_action", 160),
			clip(input.note, 4000),
			serialise(input.before),
			serialise(input.after),
			entityType,
			entityId,
			input.outcome === "failure" ? "failure" : "success",
			clip(input.requestId, 120),
			new Date().toISOString(),
		],
	);
}
