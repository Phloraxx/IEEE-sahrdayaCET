/**
 * `POST /api/events/:id/register` — the registration command.
 *
 * Replaces `POST /api/app/events/{id}/register`. The whole command (capacity,
 * insert, waitlist, counters) runs in one transaction inside
 * `createRegistration`, so this route only handles auth, parsing and status.
 *
 * The body is bounded and shaped here: `formResponses` is the answers to the
 * event's own questions, and it used to be whatever JSON object the client
 * posted — as large as the socket allowed, with nesting `createRegistration`
 * then stringified into the row. The cap and the shape live in `parseRegistrationBody`
 * so the boundary is unit-tested without HTTP.
 */

import type { ActionFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { createRegistration } from "@/server/registration/create";
import { readJsonBody } from "@/server/http/api";

function json(body: unknown, status: number): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
	});
}

/** How many questions a form answer set may carry. */
export const MAX_FORM_RESPONSES = 100;
/** Bytes of UTF-8 allowed for one answer value. */
export const MAX_FORM_RESPONSE_BYTES = 4 * 1024;

export type RegistrationBody =
	| { ok: true; formResponses: Record<string, unknown>; couponCode?: string }
	| { ok: false; code: string; error: string };

/**
 * Validate the answer shape `createRegistration` expects.
 *
 * Answers are scalars (a string, number, boolean) or an array of booleans for a
 * checkbox question. An object or a nested array is refused rather than stored:
 * nothing reads one, and it is how a 4 MB document became a registration row.
 */
export function parseRegistrationBody(body: Record<string, unknown>): RegistrationBody {
	const raw = body.formResponses;
	if (raw !== undefined && raw !== null && (typeof raw !== "object" || Array.isArray(raw))) {
		return { ok: false, code: "INVALID_BODY", error: "formResponses must be an object" };
	}

	const entries = Object.entries((raw ?? {}) as Record<string, unknown>);
	if (entries.length > MAX_FORM_RESPONSES) {
		return { ok: false, code: "BODY_TOO_LARGE", error: "Too many form answers" };
	}

	const formResponses: Record<string, unknown> = {};
	for (const [key, value] of entries) {
		if (value === null || value === undefined) continue;
		if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
			if (typeof value === "string" && Buffer.byteLength(value, "utf8") > MAX_FORM_RESPONSE_BYTES) {
				return { ok: false, code: "BODY_TOO_LARGE", error: `The answer to ${key} is too long` };
			}
			formResponses[key] = value;
			continue;
		}
		if (Array.isArray(value) && value.every((item) => typeof item === "boolean")) {
			if (value.length > MAX_FORM_RESPONSES) {
				return { ok: false, code: "BODY_TOO_LARGE", error: `The answer to ${key} has too many entries` };
			}
			formResponses[key] = value;
			continue;
		}
		return { ok: false, code: "INVALID_BODY", error: `The answer to ${key} must be a plain value` };
	}

	const coupon = body.couponCode;
	if (coupon !== undefined && coupon !== null && typeof coupon !== "string") {
		return { ok: false, code: "INVALID_BODY", error: "couponCode must be a string" };
	}
	const couponCode = typeof coupon === "string" ? coupon.slice(0, 64) : undefined;

	return { ok: true, formResponses, couponCode };
}

export async function action({ request, params }: ActionFunctionArgs) {
	if (request.method !== "POST") {
		return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
	}

	const { user } = await requireApiUser(request);
	const eventId = String(params.id ?? "");
	if (!eventId) return json({ code: "EVENT_NOT_FOUND", error: "Event not found" }, 404);

	// The route parses the body itself, so it needs its own cap: without this a
	// client could make the process parse an arbitrarily large document before
	// any field was validated. `readJsonBody` is the same reader every other JSON
	// route uses, so the number lives in one place.
	const parsed = await readJsonBody(request);
	// An array (or a scalar) is not a registration body. Silently treating it as
	// `{}` used to create a real registration out of `[]`.
	if (!parsed.ok) {
		return json({ code: parsed.code, error: parsed.error }, parsed.status);
	}

	const registration = parseRegistrationBody(parsed.body);
	if (!registration.ok) return json({ code: registration.code, error: registration.error }, 400);

	const result = await createRegistration({
		eventId,
		userId: user.id,
		formResponses: registration.formResponses,
		couponCode: registration.couponCode,
	});

	if (!result.ok) return json({ code: result.code, error: result.error }, result.status);
	return json(
		{
			registrationId: result.registrationId,
			ticketId: result.ticketId,
			paymentRequired: result.paymentRequired,
			amount: result.amount,
			registrationStatus: result.registrationStatus,
			paymentStatus: result.paymentStatus,
			reused: result.reused,
		},
		result.status,
	);
}

export function loader() {
	return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}
