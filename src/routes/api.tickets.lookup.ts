/**
 * `GET /api/tickets/lookup?ticketId=…` — the ticket page's only data source.
 *
 * Public for a real `ticket_id` (the printed id is the capability). The
 * temporary `payment_ticket_id` is resolved only for its owner or an admin, and
 * identity fields are projected only for those two, exactly as the PocketBase
 * hook did.
 */

import type { LoaderFunctionArgs } from "react-router";
import { getSessionUser } from "@/server/auth/session.server";
import { lookupTicketForClient } from "@/server/registration/attendee-surfaces";
import { json, toErrorResponse } from "@/server/http/api";

export async function loader({ request }: LoaderFunctionArgs) {
	try {
		const context = await getSessionUser(request);
		const actor = context ? { id: context.user.id, role: context.user.role } : null;
		const url = new URL(request.url);
		return json(await lookupTicketForClient(url.searchParams.get("ticketId") ?? "", actor));
	} catch (error) {
		return toErrorResponse(error);
	}
}
