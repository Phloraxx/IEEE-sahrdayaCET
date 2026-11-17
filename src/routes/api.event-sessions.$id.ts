import type { ActionFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { deleteSession, updateSession } from "@/server/attendance/service";
import { json, methodNotAllowed, readJson, toErrorResponse } from "@/server/http/api";

export async function action({ request, params }: ActionFunctionArgs) {
	try {
		const { user } = await requireApiUser(request);
		const actor = { id: user.id, role: user.role };
		const id = params.id ?? "";
		if (request.method === "DELETE") return json(await deleteSession(actor, id));
		if (request.method === "PUT" || request.method === "PATCH") {
			return json(await updateSession(actor, id, await readJson(request)));
		}
		return methodNotAllowed();
	} catch (error) {
		return toErrorResponse(error);
	}
}
