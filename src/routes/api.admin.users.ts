import type { LoaderFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { listAdminUsers } from "@/server/admin/service";
import { json, toErrorResponse } from "@/server/http/api";

/**
 * `GET /api/admin/users` — the branch user directory.
 *
 * The admin page cannot use `/api/collections/users`: that collection is a
 * `self` policy, so it always answers with the caller's own row and an admin
 * capability deliberately does not widen it. This route is the admin seam.
 */
export async function loader({ request }: LoaderFunctionArgs) {
	try {
		const { user } = await requireApiUser(request);
		const url = new URL(request.url);
		return json(
			await listAdminUsers({ id: user.id, role: user.role }, {
				q: url.searchParams.get("q") ?? undefined,
				role: url.searchParams.get("role") ?? undefined,
				page: Number(url.searchParams.get("page") ?? 1) || 1,
				perPage: Number(url.searchParams.get("perPage") ?? 40) || 40,
			}),
		);
	} catch (error) {
		return toErrorResponse(error);
	}
}
