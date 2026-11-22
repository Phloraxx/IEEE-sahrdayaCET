/**
 * `POST /api/events/:id/register` — the registration command.
 *
 * Replaces `POST /api/app/events/{id}/register`. The whole command (capacity,
 * insert, waitlist, counters) runs in one transaction inside
 * `createRegistration`, so this route only handles auth, parsing and status.
 */

import type { ActionFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { createRegistration } from "@/server/registration/create";
import { MAX_JSON_BYTES } from "@/server/http/api";

function json(body: unknown, status: number): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
	});
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
	// any field was validated.
	const declared = Number(request.headers.get("Content-Length") ?? "0");
	if (Number.isFinite(declared) && declared > MAX_JSON_BYTES) {
		return json({ code: "BODY_TOO_LARGE", error: "Request body is too large" }, 413);
	}

	const parsed = (await request.json().catch(() => null)) as unknown;
	// An array (or a scalar) is not a registration body. Silently treating it as
	// `{}` used to create a real registration out of `[]`.
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		return json({ code: "INVALID_BODY", error: "Expected a JSON object" }, 400);
	}
	const body = parsed as {
		formResponses?: Record<string, unknown>;
		couponCode?: string;
	};

	const result = await createRegistration({
		eventId,
		userId: user.id,
		formResponses: body.formResponses ?? {},
		couponCode: body.couponCode,
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

export async function loader() {
	return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}
