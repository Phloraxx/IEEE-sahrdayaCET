import type { ActionFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { supersedeCertificate } from "@/server/certificates/lifecycle";
import { json, methodNotAllowed, readJson, toErrorResponse } from "@/server/http/api";

export async function action({ request, params }: ActionFunctionArgs) {
	if (request.method !== "POST") return methodNotAllowed();
	try {
		const { user } = await requireApiUser(request);
		const result = await supersedeCertificate(
			{ id: user.id, role: user.role },
			params.eventId ?? "",
			params.certificateId ?? "",
			await readJson(request),
		);
		return json(result, result.idempotent ? 200 : 201);
	} catch (error) { return toErrorResponse(error); }
}
