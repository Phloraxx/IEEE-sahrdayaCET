import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { createAssignment, listAssignments } from "@/server/workspace/service";
import { json, methodNotAllowed, readJson, toErrorResponse } from "@/server/http/api";

export async function loader({ request }: LoaderFunctionArgs) {
	try {
		const { user } = await requireApiUser(request);
		const url = new URL(request.url);
		return json(
			await listAssignments(
				{ id: user.id, role: user.role },
				url.searchParams.get("scopeType") ?? "branch",
				url.searchParams.get("scopeId") ?? "",
			),
		);
	} catch (error) {
		return toErrorResponse(error);
	}
}

export async function action({ request }: ActionFunctionArgs) {
	if (request.method !== "POST") return methodNotAllowed();
	try {
		const { user } = await requireApiUser(request);
		const body = await readJson(request);
		return json(await createAssignment({ id: user.id, role: user.role }, body), 201);
	} catch (error) {
		return toErrorResponse(error);
	}
}
