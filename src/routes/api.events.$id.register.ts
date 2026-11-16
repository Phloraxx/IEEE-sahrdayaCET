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

	const body = (await request.json().catch(() => ({}))) as {
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
