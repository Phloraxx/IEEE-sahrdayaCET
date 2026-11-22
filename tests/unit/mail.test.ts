import { afterEach, describe, expect, it } from "vitest";

import {
	MailDeliveryBlockedError,
	normalizedMode,
	parseEmailList,
	prepare,
	resolveDelivery,
} from "../../src/server/mail/policy";
import { formatDate, formatEventParts } from "../../src/server/mail/templates/shared";
import { certificateEmail, certificateTestEmail } from "../../src/server/mail/templates/certificate";
import { ticketEmail } from "../../src/server/mail/templates/ticket";
import { receiptEmail, receiptPdf } from "../../src/server/mail/templates/receipt";

const ENV_KEYS = [
	"DEPLOY_ENV",
	"MAIL_DELIVERY_MODE",
	"MAIL_ALLOWLIST",
	"MAIL_REDIRECT_TO",
	"SITE_URL",
] as const;

const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
	for (const key of ENV_KEYS) {
		const value = saved[key];
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
});

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
	for (const key of ENV_KEYS) delete process.env[key];
	process.env.SITE_URL = "https://ieeesahrdaya.com";
	Object.assign(process.env, values);
}

describe("mail policy", () => {
	it("defaults to disabled when the mode is unset or unknown", () => {
		expect(normalizedMode("", "production")).toBe("disabled");
		expect(normalizedMode("banana", "production")).toBe("disabled");
		expect(resolveDelivery({ deployEnv: "production", recipient: "a@b.co" }).allowed).toBe(false);
	});

	it("refuses live delivery outside production", () => {
		const resolution = resolveDelivery({
			deployEnv: "staging",
			mode: "live",
			recipient: "a@b.co",
		});
		expect(resolution.allowed).toBe(false);
		expect(resolution.reason).toBe("live_not_allowed_outside_production");
	});

	it("allows live delivery only in production", () => {
		const resolution = resolveDelivery({
			deployEnv: "production",
			mode: "live",
			recipient: "a@b.co",
		});
		expect(resolution.allowed).toBe(true);
		expect(resolution.recipient).toBe("a@b.co");
	});

	it("restricts allowlist delivery to the listed addresses", () => {
		const allowed = resolveDelivery({
			deployEnv: "staging",
			mode: "allowlist",
			allowlist: "Ops@Example.com, second@example.com",
			recipient: "ops@example.com",
		});
		expect(allowed.allowed).toBe(true);

		const refused = resolveDelivery({
			deployEnv: "staging",
			mode: "allowlist",
			allowlist: "ops@example.com",
			recipient: "student@example.com",
		});
		expect(refused.allowed).toBe(false);
		expect(refused.reason).toBe("recipient_not_allowlisted");
	});

	it("redirects to the configured address and keeps the intended recipient", () => {
		const resolution = resolveDelivery({
			deployEnv: "staging",
			mode: "redirect",
			redirectTo: "qa@example.com",
			recipient: "student@example.com",
		});
		expect(resolution.allowed).toBe(true);
		expect(resolution.recipient).toBe("qa@example.com");
		expect(resolution.originalRecipient).toBe("student@example.com");
	});

	it("prefixes and banners every non-live message", () => {
		setEnv({ DEPLOY_ENV: "staging", MAIL_DELIVERY_MODE: "redirect", MAIL_REDIRECT_TO: "qa@example.com" });
		const prepared = prepare("student@example.com", { subject: "Your ticket", html: "<p>hi</p>", text: "hi" });
		expect(prepared.recipient).toBe("qa@example.com");
		expect(prepared.subject).toBe("[STAGING TEST] Your ticket");
		expect(prepared.html).toContain("intended recipient: student@example.com");
		expect(prepared.text).toContain("STAGING TEST DELIVERY");
	});

	it("refuses to prepare when the policy blocks the recipient", () => {
		setEnv({ DEPLOY_ENV: "production", MAIL_DELIVERY_MODE: "disabled" });
		expect(() => prepare("student@example.com", { subject: "s", html: "", text: "" })).toThrow(
			MailDeliveryBlockedError,
		);
	});

	it("parses and dedupes address lists", () => {
		expect(parseEmailList("A@x.com, b@x.com; a@x.com\nc@x.com")).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
	});
});

describe("mail formatting", () => {
	it("formats event dates in IST regardless of the host timezone", () => {
		// 2026-08-14T02:30:00Z is 08:00 IST on the same day.
		expect(formatDate("2026-08-14T02:30:00Z")).toBe("14 Aug 2026, 8:00 AM IST");
		const parts = formatEventParts("2026-08-14T02:30:00Z");
		expect(parts.day).toBe("14");
		expect(parts.month).toBe("AUG");
		expect(parts.time).toBe("08:00 am");
		expect(parts.weekday).toBe("Friday");
	});
});

const registration = {
	id: "reg-mail-1",
	user_name: "Anagha Rose",
	user_email: "anagha@example.com",
	ticket_id: "TKT-TEST-1",
	final_fee_paise: 50000,
	payment_status: "paid",
	payment_data: JSON.stringify({ payableAmount: 500, paidAt: "2026-11-01T10:00:00Z" }),
};

const event = {
	title: "Cyber Security Workshop",
	date: "2026-11-20T04:00:00Z",
	venue: "Sahrdaya College",
	requirements: JSON.stringify(["Bring your laptop", "Carry a student ID"]),
};

describe("mail templates", () => {
	it("builds a ticket with the QR and pass id", () => {
		const mail = ticketEmail(registration, event);
		expect(mail.subject).toBe("Your Ticket for Cyber Security Workshop");
		expect(mail.html).toContain("https://ieeesahrdaya.com/ticket/TKT-TEST-1/qr.png");
		expect(mail.html).toContain("TKT-TEST-1");
		expect(mail.html).toContain("PAID · ₹500.00");
		expect(mail.html).toContain("Bring your laptop");
		expect(mail.text).toContain("Open e-ticket: https://ieeesahrdaya.com/ticket/TKT-TEST-1");
	});

	it("builds a receipt PDF that starts with a PDF header", async () => {
		const pdf = await receiptPdf(registration, event);
		expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
		expect(pdf.length).toBeGreaterThan(800);
		const mail = receiptEmail(registration, event);
		expect(mail.subject).toBe("Payment receipt · Cyber Security Workshop");
		expect(mail.text).toContain("Amount received: INR 500.00");
	});

	it("interpolates a certificate email and always includes the verification link", () => {
		const mail = certificateEmail(
			{
				recipient_name_snapshot: "Anagha Rose",
				event_title_snapshot: "Cyber Security Workshop",
				certificate_type: "volunteer",
				credential_id: "IEEESB-2026-VOL-ABC",
				verification_token: "token-123",
				issued_at: "2026-11-01T00:00:00Z",
			},
			{ email_subject: "Your certificate | {{eventTitle}}", email_text: "Hi {{firstName}}" },
		);
		expect(mail.subject).toBe("Your certificate | Cyber Security Workshop");
		expect(mail.text).toBe("Hi Anagha");
		expect(mail.html).toContain("https://ieeesahrdaya.com/c/token-123");
		expect(mail.html).toContain("IEEESB-2026-VOL-ABC");
	});

	it("marks the test email as not valid in subject and body", () => {
		const mail = certificateTestEmail(
			{ email_subject: "Your certificate", email_text: "Hi {{firstName}}", certificate_type: "participation" },
			"Sample event",
		);
		expect(mail.subject.startsWith("[TEST / NOT VALID]")).toBe(true);
		expect(mail.html).toContain("SAMPLE DATA ONLY");
		expect(mail.text).toContain("NO CREDENTIAL WAS ISSUED");
	});
});
