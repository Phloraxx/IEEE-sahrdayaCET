import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { deleteTemplate, getTemplate, updateTemplate } from "@/server/certificates/templates";
import { json, methodNotAllowed, readJson, toErrorResponse } from "@/server/http/api";

export async function loader({ request, params }: LoaderFunctionArgs) {
	try {
		const { user } = await requireApiUser(request);
		return json(await getTemplate({ id: user.id, role: user.role }, params.id ?? ""));
	} catch (error) { return toErrorResponse(error); }
}
export async function action({ request, params }: ActionFunctionArgs) {
	try {
		const { user } = await requireApiUser(request);
		const actor = { id: user.id, role: user.role };
		if (request.method === "DELETE") return json(await deleteTemplate(actor, params.id ?? ""));
		if (request.method === "PATCH" || request.method === "PUT") {
			return json(await updateTemplate(actor, params.id ?? "", await readJson(request)));
		}
		return methodNotAllowed();
	} catch (error) { return toErrorResponse(error); }
}
