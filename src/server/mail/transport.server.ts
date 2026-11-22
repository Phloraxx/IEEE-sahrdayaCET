/**
 * SMTP transport.
 *
 * Production sends through Google Workspace — `smtp.gmail.com:587` with
 * STARTTLS and an App Password — exactly as PocketBase did. Keeping the relay
 * means SPF and DKIM stay Google's, so the change is where the message is
 * handed over, not how it is signed.
 *
 * The transport is created lazily so importing this module in a test build or a
 * CLI that never sends costs nothing. Tests inject their own transport through
 * `setTransportForTesting`.
 */

import nodemailer, { type Transporter } from "nodemailer";
import { clean } from "./policy";

export interface SmtpSettings {
	host: string;
	port: number;
	/** Implicit TLS (465). Port 587 negotiates STARTTLS with `secure: false`. */
	secure: boolean;
	user: string;
	pass: string;
	from: string;
}

export interface SmtpStatus {
	configured: boolean;
	host: string;
	port: number;
	secure: boolean;
	from: string;
}

let cached: { signature: string; transport: Transporter } | null = null;
let testing: Transporter | null = null;

export function smtpSettings(): SmtpSettings | null {
	const host = clean(process.env.SMTP_HOST);
	const from = clean(process.env.SMTP_FROM);
	if (!host || !from) return null;

	const port = Number.parseInt(clean(process.env.SMTP_PORT) || "587", 10);
	const tls = clean(process.env.SMTP_TLS).toLowerCase();
	const user = clean(process.env.SMTP_USERNAME);
	const pass = clean(process.env.SMTP_PASSWORD);

	return {
		host,
		port: Number.isFinite(port) && port > 0 ? port : 587,
		// PocketBase's SMTP_TLS=true meant implicit TLS; port 587 is STARTTLS.
		secure: tls === "true" || port === 465,
		user,
		pass,
		from,
	};
}

export function smtpStatus(): SmtpStatus {
	const settings = smtpSettings();
	const current = { host: "", port: 0, secure: false, from: "" };
	if (!settings) return { configured: false, ...current };
	return {
		configured: true,
		host: settings.host,
		port: settings.port,
		secure: settings.secure,
		from: settings.from,
	};
}

function signature(settings: SmtpSettings): string {
	return [settings.host, settings.port, settings.secure, settings.user, settings.pass, settings.from].join("\u0000");
}

export function getTransport(): Transporter {
	if (testing) return testing;
	const settings = smtpSettings();
	if (!settings) {
		throw new Error("SMTP is not configured (SMTP_HOST and SMTP_FROM are required)");
	}

	const current = signature(settings);
	if (cached?.signature === current) return cached.transport;

	const transport = nodemailer.createTransport({
		host: settings.host,
		port: settings.port,
		secure: settings.secure,
		auth: settings.user && settings.pass ? { user: settings.user, pass: settings.pass } : undefined,
		// Gmail accepts one connection at a time comfortably and rate-limits
		// bursts; a small pool keeps a certificate batch moving without hammering
		// the relay.
		pool: true,
		maxConnections: 1,
		maxMessages: 50,
		connectionTimeout: 15_000,
		greetingTimeout: 10_000,
		socketTimeout: 30_000,
	});

	cached = { signature: current, transport };
	return transport;
}

/** Replace the transport in tests. Pass `null` to restore the real one. */
export function setTransportForTesting(transport: Transporter | null): void {
	testing = transport;
	if (transport === null) cached = null;
}

/** Ask the relay whether the credentials work. Used by readiness and preflight. */
export async function verifyTransport(): Promise<void> {
	await getTransport().verify();
}

export function fromAddress(): string {
	return smtpSettings()?.from ?? "";
}
