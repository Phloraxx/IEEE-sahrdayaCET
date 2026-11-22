/**
 * `GET|POST /api/registrations/:id/payment` — payment state and initiation.
 *
 * Replaces `GET/POST /api/app/registrations/{id}/payment`. Both verbs are scoped
 * to the session user; a foreign registration answers 404.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { getPaymentStatus, startPayment } from "@/server/payments/initiate";

function json(body: unknown, status: number): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
	});
}

export async function loader({ request, params }: LoaderFunctionArgs) {
	const { user } = await requireApiUser(request);
	const result = await getPaymentStatus(String(params.id ?? ""), user.id);
	if (!result.ok) return json({ code: result.code, error: result.error }, result.status);
	return json(result, 200);
}

export async function action({ request, params }: ActionFunctionArgs) {
	if (request.method !== "POST") {
		return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
	}
	const { user } = await requireApiUser(request);
	const result = await startPayment(String(params.id ?? ""), user.id);
	if (!result.ok) return json({ code: result.code, error: result.error }, result.status);
	return json(result, result.status);
}
