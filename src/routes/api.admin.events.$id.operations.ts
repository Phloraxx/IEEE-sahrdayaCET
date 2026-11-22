import type { LoaderFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { getEventOperations } from "@/server/admin/operations";
import { json, methodNotAllowed, toErrorResponse } from "@/server/http/api";

export async function loader({ request, params }: LoaderFunctionArgs) {
	if (request.method !== "GET") return methodNotAllowed();
	try {
		const { user } = await requireApiUser(request);
		return json(await getEventOperations({ id: user.id, role: user.role }, params.id ?? ""));
	} catch (error) {
		return toErrorResponse(error);
	}
}
