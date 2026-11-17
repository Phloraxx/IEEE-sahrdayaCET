import type { ActionFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { publishTemplate } from "@/server/certificates/templates";
import { json, methodNotAllowed, toErrorResponse } from "@/server/http/api";

export async function action({ request, params }: ActionFunctionArgs) {
	if (request.method !== "POST") return methodNotAllowed();
	try {
		const { user } = await requireApiUser(request);
		return json(await publishTemplate({ id: user.id, role: user.role }, params.id ?? ""));
	} catch (error) { return toErrorResponse(error); }
}
