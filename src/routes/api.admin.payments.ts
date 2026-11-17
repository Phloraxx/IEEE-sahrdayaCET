import type { LoaderFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { listPayments } from "@/server/admin/service";
import { json, toErrorResponse } from "@/server/http/api";

/**
 * `GET /api/admin/payments` — the branch finance ledger.
 *
 * Query parameters are the ones `admin-payments-helpers.js` accepted, because
 * `admin-payments.client.ts` still sends them: `page`, `perPage`, `search`,
 * `attention=1`. Pagination is validated in the service, not coerced here, so a
 * bad page is a 400 rather than a silently different page.
 */
export async function loader({ request }: LoaderFunctionArgs) {
	try {
		const { user } = await requireApiUser(request);
		const url = new URL(request.url);
		const attention = url.searchParams.get("attention");
		if (attention && attention !== "0" && attention !== "1") {
			return json({ code: "INVALID_QUERY", error: "attention must be 1 or 0" }, 400);
		}
		return json(
			await listPayments({ id: user.id, role: user.role }, {
				page: url.searchParams.get("page") ?? undefined,
				perPage: url.searchParams.get("perPage") ?? undefined,
				search: url.searchParams.get("search") ?? undefined,
				attention: attention === "1",
			}),
		);
	} catch (error) {
		return toErrorResponse(error);
	}
}
