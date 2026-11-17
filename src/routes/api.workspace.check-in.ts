import type { ActionFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { checkIn } from "@/server/workspace/service";
import { json, methodNotAllowed, readJson, toErrorResponse } from "@/server/http/api";

export async function action({ request }: ActionFunctionArgs) {
	if (request.method !== "POST") return methodNotAllowed();
	try {
		const { user } = await requireApiUser(request);
		const body = await readJson(request);
		return json(
			await checkIn(
				{ id: user.id, role: user.role },
				String(body.ticketId ?? "").trim(),
				String(body.eventId ?? "").trim(),
			),
		);
	} catch (error) {
		return toErrorResponse(error);
	}
}
