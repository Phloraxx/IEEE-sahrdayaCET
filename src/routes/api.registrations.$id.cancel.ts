/** `POST /api/registrations/:id/cancel` — self-service cancellation. */

import type { ActionFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { cancelRegistration } from "@/server/registration/cancel";

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
	const registrationId = String(params.id ?? "");
	const body = (await request.json().catch(() => ({}))) as { reason?: string };

	const result = await cancelRegistration({
		registrationId,
		userId: user.id,
		reason: body.reason,
	});

	if (!result.ok) return json({ code: result.code, error: result.error }, result.status);
	return json(
		{
			action: result.action,
			...(result.registration ? { registration: result.registration } : {}),
			...(result.request ? { request: result.request } : {}),
		},
		result.status,
	);
}

export async function loader() {
	return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}
