import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { createTemplate, listEventTemplates } from "@/server/certificates/templates";
import { json, methodNotAllowed, readJson, toErrorResponse } from "@/server/http/api";

export async function loader({ request, params }: LoaderFunctionArgs) {
	try {
		const { user } = await requireApiUser(request);
		return json(await listEventTemplates({ id: user.id, role: user.role }, params.eventId ?? ""));
	} catch (error) { return toErrorResponse(error); }
}
export async function action({ request, params }: ActionFunctionArgs) {
	if (request.method !== "POST") return methodNotAllowed();
	try {
		const { user } = await requireApiUser(request);
		return json(await createTemplate({ id: user.id, role: user.role }, params.eventId ?? "", await readJson(request)), 201);
	} catch (error) { return toErrorResponse(error); }
}
