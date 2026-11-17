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
