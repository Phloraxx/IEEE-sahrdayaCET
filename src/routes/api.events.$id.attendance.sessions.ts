import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { createSession, listSessions } from "@/server/attendance/service";
import { json, methodNotAllowed, readJson, toErrorResponse } from "@/server/http/api";

export async function loader({ request, params }: LoaderFunctionArgs) {
	try {
		const { user } = await requireApiUser(request);
		return json(await listSessions({ id: user.id, role: user.role }, params.id ?? ""));
	} catch (error) {
		return toErrorResponse(error);
	}
}

export async function action({ request, params }: ActionFunctionArgs) {
	if (request.method !== "POST") return methodNotAllowed();
	try {
		const { user } = await requireApiUser(request);
		const body = await readJson(request);
		return json(await createSession({ id: user.id, role: user.role }, params.id ?? "", body), 201);
	} catch (error) {
		return toErrorResponse(error);
	}
}
