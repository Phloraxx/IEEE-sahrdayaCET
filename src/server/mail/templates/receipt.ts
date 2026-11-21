/**
 * Payment receipt email, with a PDF copy attached.
 *
 * Ported from `pb_hooks/notification-helpers.js#receiptEmail` and
 * `#receiptPdfBytes`. The PDF used to be written by hand; it is rebuilt with
 * `pdf-lib`, which produces the same single page and standard Helvetica text
 * without carrying a bespoke PDF writer.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { formatDate, htmlEscape, parseJsonObject } from "./shared";
import { paidAmountPaise, type TicketEvent, type TicketRegistration } from "./ticket";
import type { MailTemplate } from "../policy";

export interface ReceiptAttachment {
	filename: string;
	content: Buffer;
	contentType: string;
}

export function receiptNumber(registrationId: string): string {
	return `RCT-${String(registrationId).toUpperCase()}`;
}

function paidAt(registration: TicketRegistration): string {
	const data = parseJsonObject(registration.payment_data);
	const value = data.paidAt;
	return typeof value === "string" && value ? value : new Date().toISOString();
}

function amountText(registration: TicketRegistration): string {
	return (paidAmountPaise(registration) / 100).toFixed(2);
}

export function receiptEmail(registration: TicketRegistration, event: TicketEvent | null): MailTemplate {
	const name = htmlEscape(registration.user_name || "Student");
	const title = htmlEscape(event?.title || "IEEE Sahrdaya event");
	const amount = amountText(registration);
	const receipt = receiptNumber(registration.id);
	const ticketId = htmlEscape(registration.ticket_id || "");
	const paid = formatDate(paidAt(registration));

	const html =
		'<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#111827">' +
		'<div style="max-width:620px;margin:0 auto;padding:28px 16px"><div style="border:1px solid #e5e7eb;border-radius:24px;background:#fff;overflow:hidden">' +
		'<div style="background:#0f172a;padding:26px 30px;color:#fff"><div style="font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#7dd3fc">IEEE Sahrdaya Student Branch</div><h1 style="margin:10px 0 0;font-size:26px">Payment receipt</h1></div>' +
		`<div style="padding:30px"><p style="margin:0 0 22px;color:#64748b;line-height:1.6">Hi ${name}, your payment for <strong style="color:#111827">${title}</strong> has been received.</p>` +
		'<div style="border:1px solid #e5e7eb;border-radius:18px;padding:20px;background:#f8fafc">' +
		'<div style="font-size:13px;color:#64748b">Amount received</div>' +
		`<div style="font-size:34px;font-weight:800;margin:4px 0 18px">₹${htmlEscape(amount)}</div>` +
		`<div style="font-size:14px;line-height:1.9;color:#475569"><strong>Receipt:</strong> ${htmlEscape(receipt)}<br><strong>Paid:</strong> ${htmlEscape(paid)}<br><strong>Registration:</strong> <span style="font-family:monospace">${htmlEscape(registration.id)}</span><br><strong>Ticket:</strong> <span style="font-family:monospace">${ticketId}</span></div></div>` +
		'<p style="margin:20px 0 0;font-size:13px;color:#64748b;line-height:1.6">A PDF copy of this receipt is attached for your records.</p></div></div></div></body></html>';

	return {
		subject: `Payment receipt · ${event?.title || "IEEE Sahrdaya event"}`,
		html,
		text:
			`Payment receipt\n\nEvent: ${event?.title || "IEEE Sahrdaya event"}\n` +
			`Amount received: INR ${amount}\nReceipt: ${receipt}\nPaid: ${paid}\n` +
			`Registration: ${registration.id}\nTicket: ${registration.ticket_id || ""}`,
	};
}

interface PdfRow {
	text: string;
	size: number;
	bold?: boolean;
	gap: number;
}

/** The attached receipt, as one page of Helvetica text. */
export async function receiptPdf(registration: TicketRegistration, event: TicketEvent | null): Promise<Buffer> {
	const data = parseJsonObject(registration.payment_data);
	const refundedPaise = Number(data.amountRefundedPaise ?? 0);

	const rows: PdfRow[] = [
		{ text: "IEEE Sahrdaya Student Branch", size: 18, bold: true, gap: 28 },
		{ text: "PAYMENT RECEIPT", size: 14, bold: true, gap: 26 },
		{ text: `Receipt: ${receiptNumber(registration.id)}`, size: 10, gap: 18 },
		{ text: `Event: ${event?.title || "IEEE Sahrdaya event"}`, size: 10, gap: 16 },
		{ text: `Student: ${registration.user_name || "Student"}`, size: 10, gap: 16 },
		{ text: `Email: ${registration.user_email || ""}`, size: 10, gap: 16 },
		{ text: `Amount received: INR ${amountText(registration)}`, size: 12, bold: true, gap: 22 },
		{ text: `Paid: ${formatDate(paidAt(registration))}`, size: 10, gap: 16 },
		{ text: `Registration ID: ${registration.id}`, size: 10, gap: 16 },
		{ text: `Ticket ID: ${registration.ticket_id || ""}`, size: 10, gap: 16 },
		{ text: `Venue: ${event?.venue || "TBA"}`, size: 10, gap: 16 },
	];
	if (Number.isFinite(refundedPaise) && refundedPaise > 0) {
		rows.splice(8, 0, { text: `Refunded: INR ${(refundedPaise / 100).toFixed(2)}`, size: 10, bold: true, gap: 18 });
	}
	if (registration.payment_status === "refunded") {
		rows.splice(9, 0, { text: "Payment status: REFUNDED", size: 10, bold: true, gap: 18 });
	}
	rows.push({ text: "This receipt acknowledges payment for event registration.", size: 9, gap: 16 });

	const pdf = await PDFDocument.create();
	const page = pdf.addPage([612, 792]);
	const regular = await pdf.embedFont(StandardFonts.Helvetica);
	const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
	pdf.setTitle("Payment receipt");
	pdf.setCreator("IEEE Sahrdaya Student Branch");
	pdf.setProducer("IEEE Sahrdaya Student Branch");

	let y = 760;
	for (const row of rows) {
		// pdf-lib's standard fonts are WinAnsi; the text is ASCII after escaping.
		page.drawText(row.text.replace(/[^\x20-\x7E]/g, "?"), {
			x: 54,
			y,
			size: row.size,
			font: row.bold ? bold : regular,
			color: rgb(0, 0, 0),
		});
		y -= row.gap;
	}

	return Buffer.from(await pdf.save());
}

export async function receiptAttachment(
	registration: TicketRegistration,
	event: TicketEvent | null,
): Promise<ReceiptAttachment> {
	const content = await receiptPdf(registration, event);
	return {
		filename: `Receipt_${String(registration.id).toUpperCase()}.pdf`,
		content,
		contentType: "application/pdf",
	};
}
