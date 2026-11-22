/**
 * Render and send one real notification as a sample.
 *
 * The certificate test email proves the transport, but not the paths that carry
 * real data: a ticket's QR and event details, a receipt's PDF attachment. This
 * sends one of those through the same render + policy + transport chain, using a
 * real registration, so the proof covers the whole message.
 *
 * Run it with the deployment environment and a redirect target:
 *
 *   MAIL_DELIVERY_MODE=redirect MAIL_REDIRECT_TO=ops@example.com \
 *     npx tsx scripts/send-sample-notification.ts --registration <id> --kind receipt
 *
 * In `redirect` mode the message goes to the operator and the banner names the
 * student it was intended for. In `allowlist` mode the student's address itself
 * must be allowlisted, which is why a sample like this uses redirect.
 */

import { closeDatabase, query } from "../src/lib/db.server";
import { MailDeliveryBlockedError, prepare } from "../src/server/mail/policy";
import { renderOutboxRow } from "../src/server/mail/render";
import { fromAddress, getTransport, smtpSettings } from "../src/server/mail/transport.server";
import type { OutboxRow } from "../src/server/mail/types";

function argument(name: string): string {
	const index = process.argv.indexOf(name);
	return index >= 0 ? String(process.argv[index + 1] ?? "").trim() : "";
}

async function main() {
	const registrationId = argument("--registration");
	const kind = argument("--kind") || "receipt";
	if (!registrationId) throw new Error("usage: tsx scripts/send-sample-notification.ts --registration <id> [--kind ticket|receipt]");
	if (kind !== "ticket" && kind !== "receipt") throw new Error("--kind must be ticket or receipt");

	const found = await query<{ id: string; user_email: string | null }>(
		`SELECT id, user_email FROM registrations WHERE id = ?`,
		[registrationId],
	);
	const registration = found.rows[0];
	if (!registration) throw new Error(`registration not found: ${registrationId}`);
	const intended = String(registration.user_email ?? "").trim();
	if (!intended) throw new Error(`registration ${registrationId} has no email`);

	const now = new Date().toISOString();
	const row: OutboxRow = {
		id: "sample",
		registration_id: registration.id,
		kind,
		status: "pending",
		recipient: intended,
		dedupe_key: `sample:${kind}:${registration.id}`,
		attempts: 0,
		next_attempt_at: now,
		last_attempt_at: "",
		sent_at: "",
		last_error: "",
		certificate_id: null,
		certificate_batch_id: null,
		created_at: now,
		updated_at: now,
	};

	const rendered = await renderOutboxRow(row);
	const prepared = prepare(intended, rendered.template);
	if (!smtpSettings()) throw new Error("SMTP is not configured (SMTP_HOST and SMTP_FROM are required)");

	const info = await getTransport().sendMail({
		from: fromAddress(),
		to: prepared.recipient,
		subject: prepared.subject,
		html: prepared.html,
		text: prepared.text,
		attachments: rendered.attachments.map((attachment) => ({
			filename: attachment.filename,
			content: attachment.content,
			contentType: attachment.contentType,
		})),
	});

	console.log(
		JSON.stringify({
			at: new Date().toISOString(),
			kind,
			mode: prepared.mode,
			intendedRecipient: intended,
			recipient: prepared.recipient,
			subject: prepared.subject,
			attachments: rendered.attachments.map((attachment) => ({
				filename: attachment.filename,
				bytes: attachment.content.length,
			})),
			accepted: info.accepted,
			rejected: info.rejected,
			messageId: info.messageId,
		}),
	);
}

main()
	.catch((error) => {
		if (error instanceof MailDeliveryBlockedError) {
			console.error(`[send-sample-notification] blocked by the safety policy: ${error.reason}`);
		} else {
			console.error("[send-sample-notification] failed:", error instanceof Error ? error.message : error);
		}
		process.exitCode = 1;
	})
	.finally(() => {
		closeDatabase();
	});
