import type { ActionFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { archiveEvent } from "@/server/admin/service";
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
		return json(await archiveEvent({ id: user.id, role: user.role }, params.id ?? "", note));
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
