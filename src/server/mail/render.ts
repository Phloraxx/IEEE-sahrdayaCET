/**
 * Render one outbox row into a message.
 *
 * Each kind reads exactly the rows it needs and refuses an intent that is no
 * longer valid — a ticket for a cancelled event, a receipt for an unpaid
 * registration, a certificate that was revoked or superseded. Those refusals are
 * permanent: the worker records them once and never retries, because the state
 * they describe will not come back.
 */

import { query } from "@/lib/db.server";
import { certificateEmail } from "./templates/certificate";
import { receiptAttachment, receiptEmail } from "./templates/receipt";
import { ticketEmail } from "./templates/ticket";
import { PermanentMailError, type OutboxRow, type RenderedMail } from "./types";
import type { TicketEvent, TicketRegistration } from "./templates/ticket";

interface RegistrationEventRow extends TicketRegistration {
	registration_status: string | null;
	event_title: string | null;
	event_date: string | null;
	event_venue: string | null;
	event_requirements: string | null;
	event_end_date: string | null;
	event_status: string | null;
	event_is_deleted: number | null;
	event_id: string | null;
}

const REGISTRATION_SELECT = `
	SELECT r.id, r.user_name, r.user_email, r.ticket_id, r.final_fee_paise,
	       r.payment_status, r.payment_data, r.registration_status,
	       e.id AS event_id, e.title AS event_title, e.date AS event_date,
	       e.venue AS event_venue, e.requirements AS event_requirements,
	       e.end_date AS event_end_date, e.status AS event_status,
	       e.is_deleted AS event_is_deleted
	  FROM registrations r
	  LEFT JOIN events e ON e.id = r.event_id
	 WHERE r.id = ?`;

function toEvent(row: RegistrationEventRow): TicketEvent | null {
	if (!row.event_id) return null;
	return {
		title: row.event_title,
		date: row.event_date,
		venue: row.event_venue,
		requirements: row.event_requirements,
	};
}

function toRegistration(row: RegistrationEventRow): TicketRegistration {
	return {
		id: row.id,
		user_name: row.user_name,
		user_email: row.user_email,
		ticket_id: row.ticket_id,
		final_fee_paise: row.final_fee_paise,
		payment_status: row.payment_status,
		payment_data: row.payment_data,
	};
}

function eventIsTerminal(row: RegistrationEventRow): boolean {
	if (!row.event_id || row.event_is_deleted === 1) return true;
	if (row.event_status === "cancelled" || row.event_status === "completed") return true;
	const end = Date.parse(row.event_end_date ?? "");
	return Number.isFinite(end) && end <= Date.now();
}

async function loadRegistration(registrationId: string | null): Promise<RegistrationEventRow> {
	if (!registrationId) {
		throw new PermanentMailError("REGISTRATION_MISSING", "The queued email has no registration");
	}
	const result = await query<RegistrationEventRow>(REGISTRATION_SELECT, [registrationId]);
	const row = result.rows[0];
	if (!row) {
		throw new PermanentMailError("REGISTRATION_MISSING", "Registration no longer exists");
	}
	return row;
}

function renderTicket(row: RegistrationEventRow): RenderedMail {
	if ((row.registration_status ?? "") !== "confirmed" || !row.ticket_id) {
		throw new PermanentMailError(
			"NOTIFICATION_NO_LONGER_ELIGIBLE",
			"The ticket email is no longer valid for the current registration state",
		);
	}
	if (eventIsTerminal(row)) {
		throw new PermanentMailError(
			"NOTIFICATION_NO_LONGER_ELIGIBLE",
			"The event is cancelled, completed, deleted or already over",
		);
	}
	return { template: ticketEmail(toRegistration(row), toEvent(row)), attachments: [] };
}

async function renderReceipt(row: RegistrationEventRow): Promise<RenderedMail> {
	const paymentStatus = row.payment_status ?? "";
	if (paymentStatus !== "paid" && paymentStatus !== "refunded") {
		throw new PermanentMailError(
			"NOTIFICATION_NO_LONGER_ELIGIBLE",
			"The receipt email is only valid for a paid or refunded registration",
		);
	}
	if (Number(row.final_fee_paise ?? 0) <= 0 || !row.ticket_id) {
		throw new PermanentMailError(
			"NOTIFICATION_NO_LONGER_ELIGIBLE",
			"The receipt email requires a paid fee and a ticket",
		);
	}
	const registration = toRegistration(row);
	const event = toEvent(row);
	return {
		template: receiptEmail(registration, event),
		attachments: [await receiptAttachment(registration, event)],
	};
}

interface CertificateEmailRowDb {
	id: string;
	status: string | null;
	recipient_name_snapshot: string | null;
	recipient_email_snapshot: string | null;
	event_title_snapshot: string | null;
	certificate_type: string | null;
	credential_id: string | null;
	verification_token: string | null;
	issued_at: string | null;
	email_subject: string | null;
	email_text: string | null;
}

async function renderCertificate(certificateId: string | null): Promise<RenderedMail> {
	if (!certificateId) {
		throw new PermanentMailError("CERTIFICATE_MISSING", "The queued email has no certificate");
	}
	const result = await query<CertificateEmailRowDb>(
		`SELECT c.id, c.status, c.recipient_name_snapshot, c.recipient_email_snapshot,
		        c.event_title_snapshot, c.certificate_type, c.credential_id,
		        c.verification_token, c.issued_at,
		        t.email_subject, t.email_text
		   FROM certificates c
		   JOIN certificate_templates t ON t.id = c.template_id
		  WHERE c.id = ?`,
		[certificateId],
	);
	const row = result.rows[0];
	if (!row) {
		throw new PermanentMailError("CERTIFICATE_MISSING", "Certificate no longer exists");
	}
	if ((row.status ?? "") !== "active") {
		throw new PermanentMailError(
			"NOTIFICATION_NO_LONGER_ELIGIBLE",
			"The certificate is revoked or superseded",
		);
	}
	return {
		template: certificateEmail(
			{
				recipient_name_snapshot: row.recipient_name_snapshot,
				event_title_snapshot: row.event_title_snapshot,
				certificate_type: row.certificate_type,
				credential_id: row.credential_id,
				verification_token: row.verification_token,
				issued_at: row.issued_at,
			},
			{ email_subject: row.email_subject, email_text: row.email_text },
		),
		attachments: [],
	};
}

export async function renderOutboxRow(row: OutboxRow): Promise<RenderedMail> {
	if (row.kind === "certificate") return renderCertificate(row.certificate_id);
	const registration = await loadRegistration(row.registration_id);
	if (row.kind === "ticket") return renderTicket(registration);
	if (row.kind === "receipt") return renderReceipt(registration);
	throw new PermanentMailError("UNKNOWN_KIND", `Unknown notification kind: ${row.kind}`);
}
