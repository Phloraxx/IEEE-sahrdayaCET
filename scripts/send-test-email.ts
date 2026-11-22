/**
 * Send one bannered sample email through the real relay.
 *
 * This is the operational proof that the SMTP path works end to end: policy,
 * template, transport and Gmail handoff. It is deliberately not an API route —
 * a shell on the box is already the highest privilege, and a public "send test
 * mail" endpoint would only add surface.
 *
 *   MAIL_DELIVERY_MODE=allowlist MAIL_ALLOWLIST=ops@example.com \
 *     npx tsx scripts/send-test-email.ts --to ops@example.com
 *
 * The message is the certificate sample, marked `TEST / NOT VALID`, and the
 * safety policy still applies: a blocked recipient is an error, not a skip.
 */

import { MailDeliveryBlockedError, prepare } from "../src/server/mail/policy";
import { certificateTestEmail } from "../src/server/mail/templates/certificate";
import { fromAddress, getTransport, smtpSettings } from "../src/server/mail/transport.server";

function argument(name: string): string {
	const index = process.argv.indexOf(name);
	const value = index >= 0 ? process.argv[index + 1] : "";
	return String(value ?? "").trim();
}

async function main() {
	const to = argument("--to");
	if (!to) throw new Error("usage: tsx scripts/send-test-email.ts --to <address>");

	const template = certificateTestEmail(
		{
			email_subject: "Your certificate | {{eventTitle}}",
			email_text:
				"Hi {{firstName}},\n\nThis is a delivery test from the IEEE Sahrdaya platform. No credential was issued.\n\n{{verificationUrl}}",
			certificate_type: "participation",
		},
		"Mail delivery proof",
	);

	const prepared = prepare(to, template);
	if (!smtpSettings()) throw new Error("SMTP is not configured (SMTP_HOST and SMTP_FROM are required)");

	const info = await getTransport().sendMail({
		from: fromAddress(),
		to: prepared.recipient,
		subject: prepared.subject,
		html: prepared.html,
		text: prepared.text,
	});

	console.log(
		JSON.stringify({
			at: new Date().toISOString(),
			mode: prepared.mode,
			recipient: prepared.recipient,
			subject: prepared.subject,
			accepted: info.accepted,
			rejected: info.rejected,
			messageId: info.messageId,
		}),
	);
}

main().catch((error) => {
	if (error instanceof MailDeliveryBlockedError) {
		console.error(`[send-test-email] blocked by the safety policy: ${error.reason}`);
	} else {
		console.error("[send-test-email] failed:", error instanceof Error ? error.message : error);
	}
	process.exitCode = 1;
});
