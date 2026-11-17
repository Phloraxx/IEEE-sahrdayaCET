/** `PUT /api/events/:id/coupons` — replace an event's coupon set. */

import type { ActionFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { syncEventCoupons } from "@/server/registration/attendee-surfaces";
import { json, methodNotAllowed, readJson, toErrorResponse } from "@/server/http/api";

export async function action({ request, params }: ActionFunctionArgs) {
	if (request.method !== "PUT" && request.method !== "POST") return methodNotAllowed();
	try {
		const { user } = await requireApiUser(request);
		return json(
			await syncEventCoupons({ id: user.id, role: user.role }, params.id ?? "", await readJson(request)),
		);
	} catch (error) {
		return toErrorResponse(error);
	}
}
