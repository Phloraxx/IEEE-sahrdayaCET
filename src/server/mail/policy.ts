/**
 * Outbound-mail safety policy and envelope preparation.
 *
 * Ported from `pb_hooks/mail-delivery.js` (125 LOC). The invariant is unchanged:
 * **a non-production deployment must never send to a real recipient by
 * accident**. `MAIL_DELIVERY_MODE` decides:
 *
 *   `disabled`  — nothing leaves the process (the default when unset)
 *   `allowlist` — only addresses in `MAIL_ALLOWLIST`, still with the TEST banner
 *   `redirect`  — every message goes to `MAIL_REDIRECT_TO`, with the intended
 *                 recipient named in the banner
 *   `live`      — only when `DEPLOY_ENV=production`; no banner, no rewrite
 *
 * `prepare()` is the single place that applies the mode, so a ticket, a receipt,
 * a certificate and the admin "test email" all obey the same rules. Skipping it
 * for one path is how a staging box ends up emailing students.
 */

export type MailMode = "disabled" | "allowlist" | "redirect" | "live";

export interface DeliveryOptions {
	deployEnv?: string;
	mode?: string;
	allowlist?: string;
	redirectTo?: string;
	recipient?: string;
}

export interface DeliveryResolution {
	allowed: boolean;
	mode: MailMode;
	reason: string;
	recipient: string;
	originalRecipient: string;
	deployEnv: string;
}

export interface MailTemplate {
	subject: string;
	html: string;
	text: string;
}

export interface PreparedMail {
	/** Where the message is actually sent (redirect mode rewrites this). */
	recipient: string;
	subject: string;
	html: string;
	text: string;
	mode: MailMode;
}

/** A blocked delivery is a policy decision, never a transient failure. */
export class MailDeliveryBlockedError extends Error {
	readonly code = "MAIL_DELIVERY_BLOCKED";
	readonly permanent = true;
	readonly reason: string;

	constructor(reason: string) {
		super(`Mail delivery blocked by safety policy: ${reason}`);
		this.name = "MailDeliveryBlockedError";
		this.reason = reason;
	}
}

export function clean(value: unknown): string {
	return String(value ?? "").trim();
}

export function normalizeEmail(value: unknown): string {
	return clean(value).toLowerCase();
}

/** Parse `a@x, b@y` into a deduplicated lowercase list. */
export function parseEmailList(raw: unknown): string[] {
	const seen = new Set<string>();
	const list: string[] = [];
	for (const part of clean(raw).split(/[;,\s]+/)) {
		const email = normalizeEmail(part);
		if (!email || seen.has(email)) continue;
		seen.add(email);
		list.push(email);
	}
	return list;
}

export function normalizedMode(rawMode: unknown, _deployEnv: string): MailMode {
	const mode = clean(rawMode).toLowerCase();
	if (mode === "allowlist" || mode === "redirect" || mode === "live") return mode;
	return "disabled";
}

export function resolveDelivery(options: DeliveryOptions = {}): DeliveryResolution {
	const deployEnv = clean(options.deployEnv).toLowerCase() || "unknown";
	const recipient = clean(options.recipient);
	const normalizedRecipient = normalizeEmail(recipient);
	const requestedMode = clean(options.mode).toLowerCase();
	const mode = normalizedMode(requestedMode, deployEnv);

	const denied = (reason: string): DeliveryResolution => ({
		allowed: false,
		mode,
		reason,
		recipient,
		originalRecipient: recipient,
		deployEnv,
	});

	if (!recipient) return denied("recipient_missing");
	if (requestedMode && requestedMode !== mode && mode === "disabled") {
		return denied("invalid_mode");
	}
	if (mode === "disabled") return denied("delivery_disabled");

	if (mode === "live") {
		// `live` outside production is a configuration mistake, not permission.
		if (deployEnv !== "production") return denied("live_not_allowed_outside_production");
		return {
			allowed: true,
			mode,
			reason: "",
			recipient,
			originalRecipient: recipient,
			deployEnv,
		};
	}

	if (mode === "allowlist") {
		if (!parseEmailList(options.allowlist).includes(normalizedRecipient)) {
			return denied("recipient_not_allowlisted");
		}
		return {
			allowed: true,
			mode,
			reason: "",
			recipient,
			originalRecipient: recipient,
			deployEnv,
		};
	}

	const redirectTo = clean(options.redirectTo);
	if (!redirectTo) return denied("redirect_target_missing");
	return {
		allowed: true,
		mode,
		reason: "",
		recipient: redirectTo,
		originalRecipient: recipient,
		deployEnv,
	};
}

/** Resolve the policy from the process environment. */
export function currentResolution(recipient: string): DeliveryResolution {
	return resolveDelivery({
		deployEnv: process.env.DEPLOY_ENV,
		mode: process.env.MAIL_DELIVERY_MODE,
		allowlist: process.env.MAIL_ALLOWLIST,
		redirectTo: process.env.MAIL_REDIRECT_TO,
		recipient,
	});
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/**
 * Apply the policy to one message.
 *
 * In every non-live mode the subject is prefixed and a banner naming the
 * intended recipient is prepended, so a redirected or allowlisted test can
 * never be mistaken for a real delivery.
 */
export function prepare(recipient: string, template: MailTemplate): PreparedMail {
	const resolution = currentResolution(recipient);
	if (!resolution.allowed) throw new MailDeliveryBlockedError(resolution.reason);

	if (resolution.mode === "live") {
		return {
			recipient: resolution.recipient,
			subject: clean(template.subject),
			html: String(template.html ?? ""),
			text: String(template.text ?? ""),
			mode: resolution.mode,
		};
	}

	const envLabel = clean(resolution.deployEnv || "non-production").toUpperCase();
	const intended = resolution.originalRecipient;
	const prefix = `[${envLabel} TEST] `;
	const bannerText = `${envLabel} TEST DELIVERY — intended recipient: ${intended}`;
	const bannerHtml =
		'<div style="padding:12px 16px;margin:0 0 16px;background:#fff3cd;color:#664d03;border:1px solid #ffecb5;font:600 13px Arial,sans-serif">' +
		`${escapeHtml(bannerText)}</div>`;

	return {
		recipient: resolution.recipient,
		subject: prefix + clean(template.subject),
		html: bannerHtml + String(template.html ?? ""),
		text: `${bannerText}\n\n${String(template.text ?? "")}`,
		mode: resolution.mode,
	};
}
