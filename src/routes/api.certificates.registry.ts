import type { LoaderFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { registry } from "@/server/certificates/registry";
import { json, toErrorResponse } from "@/server/http/api";

export async function loader({ request }: LoaderFunctionArgs) {
	try {
		const { user } = await requireApiUser(request);
		const url = new URL(request.url);
		const result = await registry({ id: user.id, role: user.role }, {
			eventId: url.searchParams.get("eventId") ?? undefined,
			status: url.searchParams.get("status") ?? undefined,
			certificateType: url.searchParams.get("certificateType") ?? undefined,
			search: url.searchParams.get("search") ?? undefined,
			delivery: url.searchParams.get("delivery") ?? undefined,
			page: Number(url.searchParams.get("page") ?? 1) || 1,
			perPage: Number(url.searchParams.get("perPage") ?? 25) || 25,
		});
		if ("forbidden" in result) return json({ error: "You cannot view certificates for this event" }, 403);
		return json(result);
	} catch (error) { return toErrorResponse(error); }
}
