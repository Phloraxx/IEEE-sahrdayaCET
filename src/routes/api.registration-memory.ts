/** `GET /api/registration-memory` — reusable attendee details. */

import type { LoaderFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { getRegistrationMemory } from "@/server/registration/status";

export async function loader({ request }: LoaderFunctionArgs) {
	const { user } = await requireApiUser(request);
	const result = await getRegistrationMemory(user.id);
	return new Response(JSON.stringify(result), {
		status: 200,
		headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
	});
}
