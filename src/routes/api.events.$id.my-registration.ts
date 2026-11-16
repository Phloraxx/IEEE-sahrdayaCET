/** `GET /api/events/:id/my-registration` — the session user's registration. */

import type { LoaderFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { getMyRegistration } from "@/server/registration/status";

export async function loader({ request, params }: LoaderFunctionArgs) {
	const { user } = await requireApiUser(request);
	const eventId = String(params.id ?? "");
	const result = await getMyRegistration(eventId, user.id);
	if (!result) {
		return new Response(JSON.stringify({ error: "Event not found" }), {
			status: 404,
			headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
		});
	}
	return new Response(JSON.stringify(result), {
		status: 200,
		headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
	});
}
