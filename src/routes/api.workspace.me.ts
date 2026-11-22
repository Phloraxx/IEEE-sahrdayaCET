import type { LoaderFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { getWorkspaceMe } from "@/server/workspace/service";
import { json, toErrorResponse } from "@/server/http/api";

export async function loader({ request }: LoaderFunctionArgs) {
	try {
		const { user } = await requireApiUser(request);
		return json(await getWorkspaceMe({ id: user.id, role: user.role }));
	} catch (error) {
		return toErrorResponse(error);
	}
}
