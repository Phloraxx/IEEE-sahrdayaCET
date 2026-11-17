import type { ActionFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { correctAttendance } from "@/server/attendance/service";
import { json, methodNotAllowed, readJson, toErrorResponse } from "@/server/http/api";

export async function action({ request }: ActionFunctionArgs) {
	if (request.method !== "POST") return methodNotAllowed();
	try {
		const { user } = await requireApiUser(request);
		return json(await correctAttendance({ id: user.id, role: user.role }, await readJson(request)));
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
