/** `GET /api/my-events` — every registration the session user holds. */

import type { LoaderFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { listMyEvents } from "@/server/registration/status";

export async function loader({ request }: LoaderFunctionArgs) {
	const { user } = await requireApiUser(request);
	const result = await listMyEvents(user.id);
	return new Response(JSON.stringify(result), {
		status: 200,
		headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
	});
}
