/** `GET /api/events/:id/waitlist` — waitlist state for the signed-in attendee. */

import type { LoaderFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { getWaitlistState } from "@/server/registration/attendee-surfaces";
import { json, toErrorResponse } from "@/server/http/api";

export async function loader({ request, params }: LoaderFunctionArgs) {
	try {
		const { user } = await requireApiUser(request);
		return json(await getWaitlistState({ id: user.id, role: user.role }, params.id ?? ""));
	} catch (error) {
		return toErrorResponse(error);
	}
}
