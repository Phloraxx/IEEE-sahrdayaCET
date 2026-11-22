/**
 * Ticket email.
 *
 * Ported from `pb_hooks/notification-helpers.js#ticketEmail`. The markup is kept
 * as-is on purpose: it is the message students already recognise, and the QR is
 * a live URL (`/ticket/<id>/qr.png`) rather than an attachment, so it keeps
 * working when the ticket page changes.
 */

import { normalizeEventRequirements } from "@/lib/event-requirements";
import {
	formatEventParts,
	firstName as firstNameOf,
	htmlEscape,
	parseJsonArray,
	parseJsonObject,
	siteUrl,
} from "./shared";
import type { MailTemplate } from "../policy";

export interface TicketRegistration {
	id: string;
	user_name: string | null;
	user_email: string | null;
	ticket_id: string | null;
	final_fee_paise: number | null;
	payment_status: string | null;
	payment_data: string | null;
}

export interface TicketEvent {
	title: string | null;
	date: string | null;
	venue: string | null;
	requirements: string | null;
}

export function paidAmountPaise(registration: TicketRegistration): number {
	const data = parseJsonObject(registration.payment_data);
	const exact = Number(data.payableAmount);
	if (Number.isFinite(exact) && exact > 0) return Math.round(exact * 100);
	const paise = Number(data.payableAmountPaise);
	if (Number.isFinite(paise) && paise > 0) return Math.round(paise);
	const fee = Number(registration.final_fee_paise ?? 0);
	return Number.isFinite(fee) && fee > 0 ? Math.round(fee) : 0;
}

export function ticketEmail(registration: TicketRegistration, event: TicketEvent | null): MailTemplate {
	const rawName = registration.user_name || "Student";
	const rawTitle = event?.title || "IEEE Sahrdaya event";
	const firstNameRaw = firstNameOf(rawName);
	const firstName = htmlEscape(firstNameRaw);
	const name = htmlEscape(rawName);
	const title = htmlEscape(rawTitle);
	const venueRaw = event?.venue || "TBA";
	const venue = htmlEscape(venueRaw);
	const parts = formatEventParts(event?.date ?? "");
	const ticketIdRaw = registration.ticket_id || "";
	const ticketId = htmlEscape(ticketIdRaw);
	const ticketHref = `${siteUrl()}/ticket/${encodeURIComponent(ticketIdRaw)}`;
	const qrHref = `${ticketHref}/qr.png`;

	const paise = paidAmountPaise(registration);
	const isPaid = paise > 0;
	const entryLabel = isPaid ? `PAID · ₹${(paise / 100).toFixed(2)}` : "FREE ENTRY";
	const entryBg = isPaid ? "#eef6ff" : "#eefbf1";
	const entryBorder = isPaid ? "#b8d8f5" : "#b9e7c4";
	const entryColor = isPaid ? "#005f93" : "#18753a";

	const requirements = normalizeEventRequirements(parseJsonArray(event?.requirements)).slice(0, 4);
	let requirementsHtml = "";
	let requirementsText = "";
	if (requirements.length) {
		const items = requirements
			.map((item) => `<li style="margin:0 0 6px">${htmlEscape(item)}</li>`)
			.join("");
		requirementsHtml =
			'<tr><td style="padding:18px 2px 0"><div style="border-top:1px solid #d9d7d1;padding-top:17px">' +
			'<p style="margin:0 0 8px;font-size:9px;letter-spacing:1.2px;text-transform:uppercase;color:#00629b;font-weight:800">Before the event</p>' +
			'<ul style="margin:0;padding-left:18px;font-size:11px;line-height:1.55;color:#626262">' +
			`${items}</ul>` +
			'<p style="margin:9px 0 0;font-size:10px;line-height:1.5;color:#8a8a8a">Open your e-ticket for participant links and the latest attendee information.</p>' +
			"</div></td></tr>";
		requirementsText = `\n\nBefore the event:\n- ${requirements.join("\n- ")}\nOpen your e-ticket for participant links and the latest attendee information.`;
	}

	/* eslint-disable prefer-template -- the ticket markup is one long literal chain;
	   a single template literal would be harder to review than the original. */
	const html =
		'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
		'<body style="margin:0;padding:0;background:#f2f1ed;font-family:Arial,Helvetica,sans-serif;color:#171717">' +
		`<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">Your pass for ${title} is ready. Keep the QR handy for check-in.</div>` +
		'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#f2f1ed"><tr><td align="center" style="padding:30px 14px 38px">' +
		'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:430px">' +
		'<tr><td style="padding:0 2px 22px">' +
		'<p style="margin:0 0 12px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#00629b;font-weight:700">IEEE Sahrdaya Student Branch</p>' +
		'<h1 style="margin:0;font-size:28px;line-height:1.08;letter-spacing:-.7px;color:#171717">Your pass is ready.</h1>' +
		`<p style="margin:10px 0 0;font-size:14px;line-height:1.6;color:#636363">${firstName}, you&#39;re registered. Keep this email handy when you arrive.</p>` +
		"</td></tr>" +
		"<tr><td>" +
		'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border:1px solid #d7d5cf;border-radius:18px">' +
		'<tr><td style="padding:5px 5px 11px;background:#e2e0da;border-radius:18px">' +
		'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#fff;border-radius:14px;overflow:hidden">' +
		'<tr><td style="background:#171717;padding:14px 18px">' +
		'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
		'<td style="font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:#7dd3fc;font-weight:700">Event credential</td>' +
		'<td align="right" style="font-size:9px;letter-spacing:1.1px;text-transform:uppercase;color:#86efac;font-weight:700">● Active</td>' +
		"</tr></table></td></tr>" +
		'<tr><td style="background:#fff;padding:0">' +
		'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
		'<td width="92" valign="top" style="width:92px;background:#00629b;padding:22px 12px 20px;text-align:center;color:#fff">' +
		`<div style="font-size:39px;line-height:.9;font-weight:800;letter-spacing:-2px">${htmlEscape(parts.day)}</div>` +
		`<div style="margin-top:8px;font-size:11px;line-height:1;font-weight:800;letter-spacing:1.6px">${htmlEscape(parts.month)}</div>` +
		`<div style="margin-top:8px;font-size:9px;line-height:1;font-weight:600;letter-spacing:1px;opacity:.72">${htmlEscape(parts.year)}</div>` +
		"</td>" +
		'<td valign="top" style="padding:21px 19px 18px">' +
		`<p style="margin:0 0 8px;font-size:9px;letter-spacing:1.2px;text-transform:uppercase;color:#8b8b91;font-weight:700">${htmlEscape(parts.weekday || "Event")} · ${htmlEscape(parts.time)}</p>` +
		`<h2 style="margin:0;font-size:20px;line-height:1.22;letter-spacing:-.25px;color:#171717;font-weight:800">${title}</h2>` +
		`<p style="margin:13px 0 0;font-size:12px;line-height:1.45;color:#67676b">${venue}</p>` +
		"</td></tr></table>" +
		"</td></tr>" +
		'<tr><td style="background:#fff;padding:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
		'<td width="17" style="width:17px;height:30px;background:#e2e0da;border-top-right-radius:15px;border-bottom-right-radius:15px;font-size:0;line-height:0">&nbsp;</td>' +
		'<td style="height:30px;vertical-align:middle;background:#fff"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px dashed #c8c5bd;height:0;font-size:0;line-height:0">&nbsp;</td></tr></table></td>' +
		'<td width="17" style="width:17px;height:30px;background:#e2e0da;border-top-left-radius:15px;border-bottom-left-radius:15px;font-size:0;line-height:0">&nbsp;</td>' +
		"</tr></table></td></tr>" +
		'<tr><td style="background:#fff;padding:15px 20px 20px">' +
		'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
		'<td valign="middle" style="padding:4px 12px 14px 0"><p style="margin:0 0 3px;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#a1a1aa;font-weight:700">Issued to</p>' +
		`<p style="margin:0;font-size:15px;line-height:1.3;color:#171717;font-weight:800">${name}</p></td>` +
		`<td align="right" valign="middle" style="padding:4px 0 14px"><span style="display:inline-block;background:${entryBg};border:1px solid ${entryBorder};padding:5px 9px;border-radius:999px;font-size:9px;color:${entryColor};font-weight:800;text-transform:uppercase;white-space:nowrap">${htmlEscape(entryLabel)}</span></td>` +
		"</tr></table>" +
		'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-top:1px solid #eceae5"><tr><td align="center" style="padding-top:20px">' +
		'<p style="margin:0 0 10px;font-size:9px;letter-spacing:1.4px;text-transform:uppercase;color:#00629b;font-weight:800">Check-in</p>' +
		'<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border:1px solid #d9d7d2;border-radius:12px"><tr><td style="padding:10px">' +
		`<img src="${htmlEscape(qrHref)}" alt="Ticket QR code" width="158" height="158" style="display:block;width:158px;height:158px;border:0"></td></tr></table>` +
		'<p style="margin:12px 0 3px;font-size:9px;letter-spacing:1px;text-transform:uppercase;color:#a1a1aa;font-weight:700">Pass ID</p>' +
		`<p style="margin:0;font-size:11px;line-height:1.4;font-family:SFMono-Regular,Consolas,Liberation Mono,monospace;color:#3f3f46;font-weight:700;letter-spacing:.45px">${ticketId}</p>` +
		'<p style="margin:10px auto 0;max-width:270px;font-size:11px;line-height:1.5;color:#858585">Show this QR at check-in. Your pass is personal.</p>' +
		"</td></tr></table>" +
		'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:18px"><tr><td align="center" style="background:#171717;padding:12px 16px;border-radius:8px">' +
		`<a href="${htmlEscape(ticketHref)}" style="display:block;font-size:12px;line-height:1.3;color:#fff;font-weight:800;text-decoration:none;letter-spacing:.2px">Open e-ticket&nbsp;&nbsp;→</a>` +
		"</td></tr></table>" +
		"</td></tr>" +
		"</table></td></tr></table>" +
		"</td></tr>" +
		requirementsHtml +
		'<tr><td style="padding:17px 2px 0;font-size:11px;line-height:1.55;color:#777">Arrive a little early for a smooth check-in. Please don&#39;t forward this email or share the QR code.</td></tr>' +
		'<tr><td style="padding:24px 2px 0;border-top:1px solid #d9d7d1"><p style="margin:0;font-size:11px;color:#27272a;font-weight:700">IEEE Sahrdaya Student Branch</p><p style="margin:4px 0 0;font-size:10px;color:#a1a1aa">Advancing Technology for Humanity</p></td></tr>' +
		"</table></td></tr></table></body></html>";
	/* eslint-enable prefer-template */

	return {
		subject: `Your Ticket for ${rawTitle}`,
		html,
		text:
			"IEEE SAHRDAYA STUDENT BRANCH\n\nYour pass is ready.\n" +
			`${firstNameRaw}, you're registered.\n\nEvent: ${rawTitle}\nDate: ${parts.date}\nTime: ${parts.time}\n` +
			`Venue: ${venueRaw}\nIssued to: ${rawName}\nEntry: ${entryLabel}\nPass ID: ${ticketIdRaw}\n\n` +
			`Open e-ticket: ${ticketHref}${requirementsText}\n\n` +
			"Show the QR at check-in. Please don't forward this email or share the QR code.\n\n" +
			"IEEE Sahrdaya Student Branch\nAdvancing Technology for Humanity",
	};
}
