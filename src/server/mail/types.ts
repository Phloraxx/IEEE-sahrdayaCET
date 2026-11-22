import type { MailTemplate } from "./policy";

/** One row of `notification_outbox`, as the worker sees it. */
export interface OutboxRow {
	id: string;
	registration_id: string | null;
	kind: string;
	status: string;
	recipient: string | null;
	dedupe_key: string | null;
	attempts: number;
	next_attempt_at: string | null;
	last_attempt_at: string | null;
	sent_at: string | null;
	last_error: string | null;
	certificate_id: string | null;
	certificate_batch_id: string | null;
	created_at: string;
	updated_at: string;
}

export interface MailAttachment {
	filename: string;
	content: Buffer;
	contentType: string;
}

export interface RenderedMail {
	template: MailTemplate;
	attachments: MailAttachment[];
}

/**
 * A failure that retrying cannot fix (recipient gone, event over, credential
 * revoked, SMTP not configured). The worker stops after one attempt.
 */
export class PermanentMailError extends Error {
	readonly code: string;
	readonly permanent = true;

	constructor(code: string, message: string) {
		super(message);
		this.name = "PermanentMailError";
		this.code = code;
	}
}
