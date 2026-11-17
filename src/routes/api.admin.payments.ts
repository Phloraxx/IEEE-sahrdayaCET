import type { LoaderFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { listPayments } from "@/server/admin/service";
import { json, toErrorResponse } from "@/server/http/api";

export async function loader({ request }: LoaderFunctionArgs) {
	try {
		const { user } = await requireApiUser(request);
		const url = new URL(request.url);
		return json(
			await listPayments({ id: user.id, role: user.role }, {
				q: url.searchParams.get("q") ?? undefined,
				status: url.searchParams.get("status") ?? undefined,
				page: Number(url.searchParams.get("page") ?? 1) || 1,
				perPage: Number(url.searchParams.get("perPage") ?? 25) || 25,
			}),
		);
	} catch (error) {
		return toErrorResponse(error);
	}
}
