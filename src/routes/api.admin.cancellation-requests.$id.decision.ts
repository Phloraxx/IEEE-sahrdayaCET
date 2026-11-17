import type { ActionFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { decideCancellationRequest } from "@/server/admin/operations";
import { json, methodNotAllowed, readJson, toErrorResponse } from "@/server/http/api";

export async function action({ request, params }: ActionFunctionArgs) {
	if (request.method !== "POST") return methodNotAllowed();
	try {
		const { user } = await requireApiUser(request);
		const body = await readJson(request);
		return json(
			await decideCancellationRequest(
				{ id: user.id, role: user.role },
				params.id ?? "",
				body as Record<string, unknown>,
			),
		);
	} catch (error) {
		return toErrorResponse(error);
	}
}

/**
 * A GET on an action-only route is a wrong method, not a server fault.
 * Without this, React Router answers 400 "Unexpected Server Error", which
 * reads like a bug in every log and monitor that sees it.
 */
export function loader() {
	return methodNotAllowed();
}
