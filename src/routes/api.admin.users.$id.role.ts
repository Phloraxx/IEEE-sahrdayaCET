import type { ActionFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { changeUserRole } from "@/server/admin/service";
import { json, methodNotAllowed, readJson, toErrorResponse } from "@/server/http/api";

export async function action({ request, params }: ActionFunctionArgs) {
	if (request.method !== "POST") return methodNotAllowed();
	try {
		const { user } = await requireApiUser(request);
		const body = await readJson(request);
		return json(
			await changeUserRole(
				{ id: user.id, role: user.role },
				params.id ?? "",
				String(body.role ?? ""),
			),
		);
	} catch (error) {
		return toErrorResponse(error);
	}
}
