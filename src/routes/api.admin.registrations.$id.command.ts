import type { ActionFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { runRegistrationCommand } from "@/server/admin/operations";
import { json, methodNotAllowed, readJson, toErrorResponse } from "@/server/http/api";

export async function action({ request, params }: ActionFunctionArgs) {
	if (request.method !== "POST") return methodNotAllowed();
	try {
		const { user } = await requireApiUser(request);
		const body = await readJson(request);
		return json(
			await runRegistrationCommand(
				{ id: user.id, role: user.role },
				params.id ?? "",
				body as Record<string, unknown>,
			),
		);
	} catch (error) {
		return toErrorResponse(error);
	}
}
