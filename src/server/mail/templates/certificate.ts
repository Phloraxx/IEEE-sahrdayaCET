/**
 * Certificate email.
 *
 * Ported from `pb_hooks/certificate-delivery-helpers.js#certificateEmail`. The
 * subject and body are authored in the template with `{{placeholders}}`; the
 * surrounding shell is fixed so every credential email looks the same and always
 * carries the credential id, the authoritative verification link and a PDF link.
 *
 * The PDF is generated on demand by `/c/<token>/certificate.pdf`, so the message
 * stays small and a revoked credential is never represented by a stale file.
 */

import { htmlEscape, siteUrl } from "./shared";
import type { MailTemplate } from "../policy";

export interface CertificateEmailRow {
	recipient_name_snapshot: string | null;
	event_title_snapshot: string | null;
	certificate_type: string | null;
	credential_id: string | null;
	verification_token: string | null;
	issued_at: string | null;
}

export interface CertificateEmailTemplate {
	email_subject: string | null;
	email_text: string | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function titleCase(value: string): string {
	return value.replace(/(^|[_\s-]+)([a-z])/g, (_match, prefix: string, letter: string) => {
		return (prefix ? " " : "") + letter.toUpperCase();
	});
}

function formatIssueDate(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return `${String(date.getUTCDate()).padStart(2, "0")} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function interpolationValues(certificate: CertificateEmailRow) {
	const name = String(certificate.recipient_name_snapshot ?? "").trim();
	const verificationUrl = `${siteUrl()}/c/${encodeURIComponent(certificate.verification_token || "")}`;
	return {
		name,
		firstName: name.split(/\s+/)[0] || "Student",
		eventTitle: String(certificate.event_title_snapshot ?? "").trim(),
		credentialId: String(certificate.credential_id ?? "").trim(),
		verificationUrl,
		certificateType: titleCase(String(certificate.certificate_type ?? "")),
		issueDate: formatIssueDate(String(certificate.issued_at ?? "")),
	};
}

/** Replace `{{key}}` with its value; unknown keys become empty, never literal. */
export function interpolate(value: string, values: Record<string, string>): string {
	return String(value || "").replace(/{{\s*([A-Za-z0-9_]+)\s*}}/g, (_match, key: string) => {
		return Object.prototype.hasOwnProperty.call(values, key) ? String(values[key] || "") : "";
	});
}

export function certificateEmail(
	certificate: CertificateEmailRow,
	template: CertificateEmailTemplate,
): MailTemplate {
	const values = interpolationValues(certificate);
	const subject = interpolate(template.email_subject || "Your certificate | {{eventTitle}}", values);
	const authoredText = interpolate(
		template.email_text ||
			"Hi {{firstName}},\n\nYour certificate for {{eventTitle}} is ready.\n\nView and verify it: {{verificationUrl}}\nCredential ID: {{credentialId}}",
		values,
	);
	const verificationUrl = values.verificationUrl;
	const pdfUrl = `${verificationUrl}/certificate.pdf`;
	const bodyHtml = htmlEscape(authoredText).replace(/\r?\n/g, "<br>");

	const html =
		'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
		'<body style="margin:0;padding:0;background:#f3f5f7;font-family:Arial,Helvetica,sans-serif;color:#17212b">' +
		'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:32px 14px">' +
		'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#fff;border:1px solid #dfe5ea;border-radius:18px;overflow:hidden">' +
		'<tr><td style="padding:28px 30px 18px;border-top:5px solid #00629b">' +
		'<p style="margin:0 0 10px;font-size:10px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;color:#00629b">IEEE Sahrdaya Student Branch</p>' +
		'<h1 style="margin:0;font-size:26px;line-height:1.15;color:#17212b">Your certificate is ready.</h1>' +
		`<p style="margin:16px 0 0;font-size:14px;line-height:1.7;color:#53616d">${bodyHtml}</p>` +
		"</td></tr>" +
		'<tr><td style="padding:4px 30px 28px">' +
		'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f9fb;border:1px solid #e1e8ed;border-radius:12px"><tr><td style="padding:16px 18px">' +
		'<p style="margin:0 0 5px;font-size:10px;text-transform:uppercase;letter-spacing:1.2px;color:#7b8791">Credential ID</p>' +
		`<p style="margin:0;font:700 13px SFMono-Regular,Consolas,monospace;color:#17212b">${htmlEscape(values.credentialId)}</p>` +
		"</td></tr></table>" +
		'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px"><tr><td align="center" style="background:#00629b;border-radius:9px;padding:13px 16px">' +
		`<a href="${htmlEscape(verificationUrl)}" style="display:block;color:#fff;text-decoration:none;font-size:13px;font-weight:700">View &amp; verify certificate</a>` +
		"</td></tr></table>" +
		`<p style="margin:13px 0 0;text-align:center;font-size:11px;color:#7b8791"><a href="${htmlEscape(pdfUrl)}" style="color:#00629b">Download PDF</a> · Verification remains authoritative if credential status changes.</p>` +
		"</td></tr>" +
		"</table>" +
		'<p style="margin:16px 0 0;font-size:10px;line-height:1.5;color:#8a949c">IEEE Sahrdaya Student Branch · Advancing Technology for Humanity</p>' +
		"</td></tr></table></body></html>";

	return {
		subject,
		html,
		text: authoredText,
	};
}

/**
 * Sample certificate email for the admin "send test" action.
 *
 * Ported from `certificate-delivery-helpers.js#certificateTestEmail`. The values
 * are obviously fake and the message is bannered twice — in the subject and at
 * the top of the body — because a screenshot of this email must never look like
 * a real credential.
 */
export function certificateTestEmail(
	template: CertificateEmailTemplate & { certificate_type: string | null },
	eventTitle: string,
): MailTemplate {
	const today = new Date().toISOString();
	const sampleValues: Record<string, string> = {
		name: "Alexandra Joseph",
		firstName: "Alexandra",
		eventTitle: eventTitle || "IEEE Sahrdaya sample event",
		credentialId: "TEST-NOT-VALID",
		verificationUrl: `${siteUrl()}/c/TEST-NOT-VALID`,
		certificateType: titleCase(String(template.certificate_type || "participation")),
		issueDate: formatIssueDate(today),
	};
	const subject = `[TEST / NOT VALID] ${interpolate(template.email_subject || "Your certificate | {{eventTitle}}", sampleValues)}`;
	const authoredText = interpolate(
		template.email_text ||
			"Hi {{firstName}},\n\nYour certificate for {{eventTitle}} is ready.\n\nView and verify it: {{verificationUrl}}\nCredential ID: {{credentialId}}",
		sampleValues,
	);
	const bannerText = "TEST / NOT VALID — SAMPLE CERTIFICATE EMAIL — NO CREDENTIAL WAS ISSUED";
	const text = `${bannerText}\n\n${authoredText}\n\nThe verification URL and credential ID above are sample values and are not valid.`;
	const bodyHtml = htmlEscape(authoredText).replace(/\r?\n/g, "<br>");

	const html =
		'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
		'<body style="margin:0;padding:0;background:#f3f5f7;font-family:Arial,Helvetica,sans-serif;color:#17212b">' +
		'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:32px 14px">' +
		'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#fff;border:1px solid #dfe5ea;border-radius:18px;overflow:hidden">' +
		'<tr><td style="padding:14px 20px;background:#fff1f1;border-bottom:1px solid #ffcaca;text-align:center;color:#9f1d1d;font-size:13px;font-weight:800;letter-spacing:.8px">TEST / NOT VALID · SAMPLE DATA ONLY</td></tr>' +
		'<tr><td style="padding:28px 30px 18px;border-top:5px solid #00629b">' +
		'<p style="margin:0 0 10px;font-size:10px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;color:#00629b">IEEE Sahrdaya Student Branch</p>' +
		'<h1 style="margin:0;font-size:26px;line-height:1.15;color:#17212b">Certificate email preview.</h1>' +
		`<p style="margin:16px 0 0;font-size:14px;line-height:1.7;color:#53616d">${bodyHtml}</p>` +
		"</td></tr>" +
		'<tr><td style="padding:4px 30px 28px">' +
		'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f9fb;border:1px solid #e1e8ed;border-radius:12px"><tr><td style="padding:16px 18px">' +
		'<p style="margin:0 0 5px;font-size:10px;text-transform:uppercase;letter-spacing:1.2px;color:#7b8791">Sample credential ID</p>' +
		`<p style="margin:0;font:700 13px SFMono-Regular,Consolas,monospace;color:#17212b">${htmlEscape(sampleValues.credentialId)}</p>` +
		"</td></tr></table>" +
		'<p style="margin:13px 0 0;text-align:center;font-size:11px;color:#9f1d1d">This is a sample. No credential was issued and the link above is not valid.</p>' +
		"</td></tr></table>" +
		'<p style="margin:16px 0 0;font-size:10px;line-height:1.5;color:#8a949c">IEEE Sahrdaya Student Branch · Advancing Technology for Humanity</p>' +
		"</td></tr></table></body></html>";

	return { subject, html, text };
}
