/**
 * `POST /api/registrations/:id/payment/reconcile` — re-evaluate a pending payment.
 *
 * The PocketBase hook asked the provider for the live payment state. The port
 * has no provider *read* call (reconciliation is the batch job's job), so this
 * runs the same local expiry rule the batch uses and returns the refreshed
 * state. It is a "refresh this page's truth" button, not a provider sync — the
 * batch reconcile remains the independent correctness path.
 */

import type { ActionFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { query, withTransaction } from "@/lib/db.server";
import { getPaymentStatus } from "@/server/payments/initiate";
import { shouldReleasePendingRegistration, type PendingRegistration } from "@/server/payments/reconcile";
import { json, methodNotAllowed, toErrorResponse } from "@/server/http/api";

export async function action({ request, params }: ActionFunctionArgs) {
	if (request.method !== "POST") return methodNotAllowed();
	try {
		const { user } = await requireApiUser(request);
		const registrationId = params.id ?? "";

		const found = await query<PendingRegistration & { user_id: string | null }>(
			"SELECT * FROM registrations WHERE id = ?",
			[registrationId],
		);
		const registration = found.rows[0];
		if (!registration) return json({ error: "Registration not found" }, 404);
		if (user.role !== "admin" && registration.user_id !== user.id) {
			return json({ error: "You cannot access this registration" }, 403);
		}

		const graceSeconds = Number(process.env.PAYGATE_REGISTRATION_GRACE_SECONDS ?? 600) || 600;
		if (shouldReleasePendingRegistration(registration, Date.now(), graceSeconds)) {
			await withTransaction(async () => {
				await query(
					`UPDATE registrations
					    SET registration_status = 'cancelled', payment_status = 'failed', updated_at = ?
					  WHERE id = ? AND registration_status = 'pending'`,
					[new Date().toISOString(), registrationId],
				);
			});
		}

		const state = await getPaymentStatus(registrationId, user.id);
		return json(state);
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
