import type { ActionFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { deactivateAssignment } from "@/server/workspace/service";
import { json, methodNotAllowed, toErrorResponse } from "@/server/http/api";

export async function action({ request, params }: ActionFunctionArgs) {
	if (request.method !== "DELETE") return methodNotAllowed();
	try {
		const { user } = await requireApiUser(request);
		return json(await deactivateAssignment({ id: user.id, role: user.role }, params.id ?? ""));
	} catch (error) {
		return toErrorResponse(error);
	}
}
