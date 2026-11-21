/**
 * Admin "send test email" for a certificate template.
 *
 * Reuses the template read (which enforces the capability check), builds the
 * bannered sample from `certificateTestEmail`, applies the same safety policy as
 * every other message, and hands it to the relay. Returning the resolved mode
 * and actual recipient lets the admin see when a redirect or allowlist rewrote
 * the address.
 */

import { query } from "@/lib/db.server";
import type { Actor } from "@/server/authz/capabilities";
import { getTemplate } from "@/server/certificates/templates";
import { WorkspaceError } from "@/server/workspace/service";
import { MailDeliveryBlockedError, prepare } from "./policy";
import { certificateTestEmail } from "./templates/certificate";
import { fromAddress, getTransport, smtpSettings } from "./transport.server";

function fail(status: number, code: string, message: string): never {
	throw new WorkspaceError(status, code, message);
}

export async function sendTemplateTestEmail(actor: Actor, templateId: string, recipient: string) {
	const { template } = await getTemplate(actor, templateId);
	const eventId = typeof template.eventId === "string" ? template.eventId : "";
	const event = eventId
		? (await query<{ title: string | null }>(`SELECT title FROM events WHERE id = ?`, [eventId])).rows[0]
		: undefined;

	const message = certificateTestEmail(
		{
			email_subject: typeof template.emailSubject === "string" ? template.emailSubject : null,
			email_text: typeof template.emailText === "string" ? template.emailText : null,
			certificate_type: typeof template.certificateType === "string" ? template.certificateType : null,
		},
		event?.title ?? "",
	);

	let prepared;
	try {
		prepared = prepare(recipient, message);
	} catch (error) {
		if (error instanceof MailDeliveryBlockedError) {
			fail(409, "MAIL_DELIVERY_BLOCKED", `Mail delivery is blocked by the safety policy: ${error.reason}`);
		}
		throw error;
	}

	if (!smtpSettings()) {
		fail(409, "SMTP_NOT_CONFIGURED", "SMTP_HOST and SMTP_FROM must be set before a test email can be sent");
	}

	await getTransport().sendMail({
		from: fromAddress(),
		to: prepared.recipient,
		subject: prepared.subject,
		html: prepared.html,
		text: prepared.text,
	});

	return {
		recipient: prepared.recipient,
		deliveryMode: prepared.mode,
		provider: "smtp",
		stubbed: false,
	};
}
