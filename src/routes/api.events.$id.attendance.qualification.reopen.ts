import type { ActionFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { reopenQualification } from "@/server/attendance/service";
import { json, methodNotAllowed, toErrorResponse } from "@/server/http/api";

export async function action({ request, params }: ActionFunctionArgs) {
	if (request.method !== "POST") return methodNotAllowed();
	try {
		const { user } = await requireApiUser(request);
		let note = "";
		try {
			const body = (await request.json()) as { note?: unknown };
			note = String(body?.note ?? "");
		} catch {
			note = "";
		}
		return json(await reopenQualification({ id: user.id, role: user.role }, params.id ?? "", note));
	} catch (error) {
		return toErrorResponse(error);
	}
}
