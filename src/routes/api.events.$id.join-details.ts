/** `GET /api/events/:id/join-details` — attendee-only join links. */

import type { LoaderFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { getJoinDetails } from "@/server/registration/attendee-surfaces";
import { json, toErrorResponse } from "@/server/http/api";

export async function loader({ request, params }: LoaderFunctionArgs) {
	try {
		const { user } = await requireApiUser(request);
		return json(await getJoinDetails({ id: user.id, role: user.role }, params.id ?? ""));
	} catch (error) {
		return toErrorResponse(error);
	}
}
