/** `POST /api/admin/registrations/:id/notifications/:kind/resend` — requeue one email. */

import type { ActionFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { canManageRegistration } from "@/server/registration/attendee-surfaces";
import { enqueue } from "@/server/notifications/outbox";
import { finalFeePaise } from "@/server/registration/helpers";
import { json, methodNotAllowed, toErrorResponse } from "@/server/http/api";

export async function action({ request, params }: ActionFunctionArgs) {
	if (request.method !== "POST") return methodNotAllowed();
	try {
		const { user } = await requireApiUser(request);
		const kind = params.kind ?? "";
		if (kind !== "ticket" && kind !== "receipt") {
			return json({ error: "Invalid notification kind" }, 400);
		}
		const { registration } = await canManageRegistration(
			{ id: user.id, role: user.role },
			params.id ?? "",
		);

		const queued = await enqueue(
			{
				registrationId: registration.id,
				registrationStatus: registration.registration_status ?? "",
				paymentStatus: registration.payment_status ?? "",
				ticketId: registration.ticket_id,
				userEmail: registration.user_email,
				finalFeePaise: finalFeePaise(registration),
			},
			kind,
			true,
		);
		if (!queued) {
			return json(
				{ error: kind === "receipt" ? "Paid receipt is not available" : "Ticket is not available" },
				409,
			);
		}
		return json({ success: true, status: "pending" }, 202);
	} catch (error) {
		return toErrorResponse(error);
	}
}

/**
 * A GET on an action-only route is a wrong method, not a server fault.
 * Without this, React Router answers 400 "Unexpected Server Error", which
 * reads like a bug in every log and monitor that sees it.
 */
export function loader() {
	return methodNotAllowed();
}
