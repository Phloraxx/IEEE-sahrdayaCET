/**
 * `POST /api/registrations/:id/payment/reconcile` — re-evaluate a pending payment.
 *
 * This is the attendee's "check this payment" refresh. It reads the provider's
 * authoritative state (bounded, validated) and applies it through the same
 * transition the webhook and the reconciliation pass use, so:
 *
 *   - a payment whose webhook was lost is confirmed here instead of waiting for
 *     the next batch pass;
 *   - a reservation is never released from stale local knowledge, and a 404 is
 *     not local knowledge of anything — an initialised reservation is held;
 *   - a parallel webhook or pass that wins the race makes this a no-op.
 *
 * Response parity with the payment page: the body is the same session shape the
 * page reads from `GET`/`POST /api/registrations/:id/payment`, plus
 * `providerReachable`, so `normalizePaymentSession()` and every success
 * indicator (`registrationStatus`/`paymentStatus`/`ticketId`/`upiUri`) behave
 * exactly as before. When the provider read is switched off (the default until
 * a sandbox check) the refresh still answers with the settled local session and
 * reports the provider as reachable, so no page starts showing a "provider
 * delayed" warning for a feature that is merely inactive.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { query } from "@/lib/db.server";
import { getPaymentStatus } from "@/server/payments/initiate";
import { syncRegistrationWithProvider } from "@/server/payments/apply";
import { json, methodNotAllowed, toErrorResponse } from "@/server/http/api";

/** One refresh may take one bounded provider read; keep the browser waiting a little longer. */
const REFRESH_READ_TIMEOUT_MS = 5_000;

export async function action({ request, params }: ActionFunctionArgs) {
	if (request.method !== "POST") return methodNotAllowed();
	try {
		const { user } = await requireApiUser(request);
		const registrationId = String(params.id ?? "");

		const found = await query<{
			user_id: string | null;
			registration_status: string;
			payment_status: string;
		}>("SELECT user_id, registration_status, payment_status FROM registrations WHERE id = ?", [
			registrationId,
		]);
		const registration = found.rows[0];
		if (!registration) return json({ error: "Registration not found" }, 404);
		if (user.role !== "admin" && registration.user_id !== user.id) {
			return json({ error: "You cannot access this registration" }, 403);
		}

		// A registration that already left `pending` needs no provider read: its
		// state is settled either way.
		let reachable = true;
		if (
			registration.registration_status === "pending" &&
			registration.payment_status === "pending"
		) {
			const sync = await syncRegistrationWithProvider(registrationId, {
				timeoutMs: REFRESH_READ_TIMEOUT_MS,
			});
			// "Reachable" only means "the provider answered this read". A reply
			// that could not be used (a racing settle) still proves reachability.
			reachable = sync.providerReachable || !sync.state.retry;
		}

		const state = await getPaymentStatus(registrationId, user.id);
		if (!state.ok) return json({ code: state.code, error: state.error }, state.status);
		return json({ ...state, providerReachable: reachable });
	} catch (error) {
		return toErrorResponse(error);
	}
}

/**
 * A GET on an action-only route is a wrong method, not a server fault.
 * Without this, React Router answers 400 "Unexpected Server Error", which
 * reads like a bug in every log and monitor that sees it.
 */
export function loader(_args: LoaderFunctionArgs) {
	return methodNotAllowed();
}
