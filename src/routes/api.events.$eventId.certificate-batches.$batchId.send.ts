import type { ActionFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { sendBatch } from "@/server/certificates/delivery";
import { json, methodNotAllowed, toErrorResponse } from "@/server/http/api";

export async function action({ request, params }: ActionFunctionArgs) {
	if (request.method !== "POST") return methodNotAllowed();
	try {
		const { user } = await requireApiUser(request);
		const result = await sendBatch({ id: user.id, role: user.role }, params.eventId ?? "", params.batchId ?? "");
		return json(result, "idempotent" in result && result.idempotent ? 200 : 202);
	} catch (error) { return toErrorResponse(error); }
}
