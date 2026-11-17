/** `POST /api/events/:id/waitlist/join` — join the waitlist. */

import type { ActionFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { joinWaitlist } from "@/server/registration/attendee-surfaces";
import { json, methodNotAllowed, readJson, toErrorResponse } from "@/server/http/api";

export async function action({ request, params }: ActionFunctionArgs) {
	if (request.method !== "POST") return methodNotAllowed();
	try {
		const { user } = await requireApiUser(request);
		const body = await readJson(request);
		return json(await joinWaitlist({ id: user.id, role: user.role }, params.id ?? "", body), 201);
	} catch (error) {
		return toErrorResponse(error);
	}
}
