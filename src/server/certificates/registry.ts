/**
 * Certificate registry.
 *
 * Ported from `certificate-registry.pb.js` (10 LOC) and
 * `certificate-registry-helpers.js` (308 LOC).
 *
 * A cross-event list of issued credentials, scoped by the events the actor can
 * actually see. The scoping happens in SQL (`event_id IN (...)`), not by
 * filtering afterwards, so a page cannot leak a row it should not have counted.
 */

import { query } from "@/lib/db.server";
import { hasCapability, hasEventCapability, type Actor } from "@/server/authz/capabilities";
import { loadAssignments } from "@/server/workspace/service";
import { accessibleEventIds } from "@/server/admin/service";

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

export interface RegistryQuery {
	eventId?: string;
	status?: string;
	certificateType?: string;
	search?: string;
	delivery?: string;
	page?: number;
	perPage?: number;
}

export async function registry(actor: Actor, input: RegistryQuery) {
	// A branch-level view sees every event; otherwise only the events where an
	// assignment grants certificates.view.
	const assignments = await loadAssignments(actor.id);
	const branchWide = hasCapability(actor, "certificates.view", {}, assignments);

	let allowed: string[] | null = null;
	if (!branchWide) {
		allowed = await accessibleEventIds(actor, "certificates.view");
		if (allowed === null) allowed = null;
	}

	// A specific event must be one the actor can see.
	if (input.eventId) {
		if (allowed !== null && !allowed.includes(input.eventId)) {
			return { forbidden: true };
		}
		const event = await query<{ id: string; society_id: string | null }>(
			`SELECT id, society_id FROM events WHERE id = ?`,
			[input.eventId],
		);
		const scope = event.rows[0];
		if (!scope) return { forbidden: true };
		const canSee = branchWide || hasEventCapability(actor, "certificates.view", { id: scope.id, societyId: scope.society_id }, assignments);
		if (!canSee) return { forbidden: true };
	} else if (allowed !== null && allowed.length === 0) {
		return {
			certificates: [],
			total: 0,
			page: 1,
			perPage: 25,
			hasMore: false,
			summary: { active: 0, revoked: 0, superseded: 0 },
			events: [],
		};
	}

	const page = clampInt(input.page, 1, 1, 100_000);
	const perPage = clampInt(input.perPage, 25, 1, 100);

	const where: string[] = [];
	const params: unknown[] = [];

	if (input.eventId) {
		where.push("c.event_id = ?");
		params.push(input.eventId);
	} else if (allowed !== null) {
		where.push(`c.event_id IN (${allowed.map(() => "?").join(", ")})`);
		params.push(...allowed);
	}

	if (input.status) {
		where.push("c.status = ?");
		params.push(input.status);
	}
	if (input.certificateType) {
		where.push("c.certificate_type = ?");
		params.push(input.certificateType);
	}
	if (input.search) {
		where.push("(c.recipient_name_snapshot LIKE ? OR c.credential_id LIKE ? OR c.recipient_email_snapshot LIKE ?)");
		const like = `%${input.search}%`;
		params.push(like, like, like);
	}
	if (input.delivery === "queued") {
		where.push("o.status = 'pending'");
	} else if (input.delivery === "stubbed") {
		where.push("o.status = 'stubbed'");
	} else if (input.delivery === "failed") {
		where.push("o.status = 'failed'");
	} else if (input.delivery === "not_queued") {
		where.push("o.id IS NULL");
	}

	const whereSql = where.length ? ` WHERE ${where.join(" AND ")}` : "";

	const total = await query<{ count: number }>(
		`SELECT COUNT(*) AS count FROM certificates c
		   LEFT JOIN notification_outbox o ON o.certificate_id = c.id${whereSql}`,
		params,
	);

	const rows = await query<Record<string, unknown>>(
		`SELECT c.id, c.event_id, c.registration_id, c.volunteer_id, c.batch_id, c.template_id,
		        c.certificate_type, c.credential_id, c.recipient_name_snapshot,
		        c.recipient_email_snapshot, c.event_title_snapshot, c.issued_at,
		        c.status, c.revoked_at, c.revocation_reason, c.supersedes, c.superseded_by,
		        e.title AS event_title,
		        o.status AS delivery_status, o.attempts AS delivery_attempts,
		        o.last_error AS delivery_error
		   FROM certificates c
		   LEFT JOIN events e ON e.id = c.event_id
		   LEFT JOIN notification_outbox o ON o.certificate_id = c.id
		   ${whereSql}
		  ORDER BY c.issued_at DESC, c.credential_id DESC
		  LIMIT ? OFFSET ?`,
		[...params, perPage, (page - 1) * perPage],
	);

	const summaryRows = await query<{ status: string; count: number }>(
		`SELECT c.status, COUNT(*) AS count FROM certificates c${whereSql} GROUP BY c.status`,
		params,
	);
	const summary: Record<string, number> = { active: 0, revoked: 0, superseded: 0 };
	for (const row of summaryRows.rows) summary[row.status] = row.count;

	const eventRows = await query<{ id: string; title: string | null }>(
		`SELECT DISTINCT e.id, e.title FROM certificates c JOIN events e ON e.id = c.event_id
		 ${allowed !== null ? `WHERE c.event_id IN (${allowed.map(() => "?").join(", ")})` : ""}
		 ORDER BY e.title`,
		allowed ?? [],
	);

	const totalCount = total.rows[0]?.count ?? 0;

	return {
		certificates: rows.rows.map((row) => ({
			id: row.id,
			eventId: row.event_id,
			eventTitle: row.event_title ?? row.event_title_snapshot ?? "",
			registrationId: row.registration_id,
			volunteerId: row.volunteer_id ?? null,
			batchId: row.batch_id,
			templateId: row.template_id,
			certificateType: row.certificate_type ?? "",
			credentialId: row.credential_id ?? "",
			recipientName: row.recipient_name_snapshot ?? "",
			recipientEmail: row.recipient_email_snapshot ?? "",
			issuedAt: row.issued_at ?? "",
			status: row.status ?? "active",
			revokedAt: row.revoked_at ?? "",
			revocationReason: row.revocation_reason ?? "",
			supersedesId: row.supersedes ?? "",
			supersededById: row.superseded_by ?? "",
			deliveryStatus: row.delivery_status ?? "not_queued",
			deliveryAttempts: row.delivery_attempts ?? 0,
			deliveryError: row.delivery_error ?? "",
		})),
		total: totalCount,
		page,
		perPage,
		hasMore: (page - 1) * perPage + rows.rows.length < totalCount,
		summary,
		events: eventRows.rows.map((row) => ({ id: row.id, title: row.title ?? "" })),
	};
}
