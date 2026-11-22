/** `GET /api/admin/registrations/:id/notifications` — delivery state panel. */

import type { LoaderFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { canManageRegistration } from "@/server/registration/attendee-surfaces";
import { notificationSnapshot } from "@/server/notifications/outbox";
import { finalFeePaise } from "@/server/registration/helpers";
import { json, toErrorResponse } from "@/server/http/api";

export async function loader({ request, params }: LoaderFunctionArgs) {
	try {
		const { user } = await requireApiUser(request);
		const { registration } = await canManageRegistration(
			{ id: user.id, role: user.role },
			params.id ?? "",
		);
		const hasTicket = Boolean(registration.ticket_id);
		const settled =
			registration.payment_status === "paid" || registration.payment_status === "refunded";
		return json({
			ticketAvailable: registration.registration_status === "confirmed" && hasTicket,
			receiptAvailable: settled && finalFeePaise(registration) > 0 && hasTicket,
			notifications: await notificationSnapshot(registration.id),
		});
	} catch (error) {
		return toErrorResponse(error);
	}
}
