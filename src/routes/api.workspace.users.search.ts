import type { LoaderFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { searchUsers } from "@/server/workspace/service";
import { json, toErrorResponse } from "@/server/http/api";

export async function loader({ request }: LoaderFunctionArgs) {
	try {
		const { user } = await requireApiUser(request);
		const url = new URL(request.url);
		return json(
			await searchUsers(
				{ id: user.id, role: user.role },
				(url.searchParams.get("q") ?? "").trim(),
				url.searchParams.get("scopeType") ?? "branch",
				url.searchParams.get("scopeId") ?? "",
			),
		);
	} catch (error) {
		return toErrorResponse(error);
	}
}
