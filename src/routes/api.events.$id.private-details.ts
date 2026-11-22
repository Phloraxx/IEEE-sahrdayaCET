/** `GET|PUT /api/events/:id/private-details` — the admin private-access editor. */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { getPrivateDetails, savePrivateDetails } from "@/server/registration/attendee-surfaces";
import { json, methodNotAllowed, readJson, toErrorResponse } from "@/server/http/api";

export async function loader({ request, params }: LoaderFunctionArgs) {
	try {
		const { user } = await requireApiUser(request);
		return json(await getPrivateDetails({ id: user.id, role: user.role }, params.id ?? ""));
	} catch (error) {
		return toErrorResponse(error);
	}
}

export async function action({ request, params }: ActionFunctionArgs) {
	if (request.method !== "PUT" && request.method !== "PATCH") return methodNotAllowed();
	try {
		const { user } = await requireApiUser(request);
		return json(
			await savePrivateDetails(
				{ id: user.id, role: user.role },
				params.id ?? "",
				await readJson(request),
			),
		);
	} catch (error) {
		return toErrorResponse(error);
	}
}
