import type { ActionFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { cancelEvent } from "@/server/admin/service";
import { json, methodNotAllowed, toErrorResponse } from "@/server/http/api";

export async function action({ request, params }: ActionFunctionArgs) {
	if (request.method !== "POST") return methodNotAllowed();
	try {
		const { user } = await requireApiUser(request);
		// The note is optional; a missing or malformed body must not fail the command.
		let note = "";
		try {
			const body = (await request.json()) as { note?: unknown };
			note = String(body?.note ?? "");
		} catch {
			note = "";
		}
		return json(await cancelEvent({ id: user.id, role: user.role }, params.id ?? "", note));
	} catch (error) {
		return toErrorResponse(error);
	}
}
