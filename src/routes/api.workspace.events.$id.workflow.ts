import type { ActionFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { runEventWorkflow } from "@/server/workspace/service";
import { json, methodNotAllowed, readJson, toErrorResponse } from "@/server/http/api";

export async function action({ request, params }: ActionFunctionArgs) {
	if (request.method !== "POST") return methodNotAllowed();
	try {
		const { user } = await requireApiUser(request);
		const body = await readJson(request);
		return json(
			await runEventWorkflow(
				{ id: user.id, role: user.role },
				params.id ?? "",
				String(body.action ?? ""),
				String(body.note ?? ""),
			),
		);
	} catch (error) {
		return toErrorResponse(error);
	}
}
