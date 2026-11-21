/**
 * `POST /api/certificate-templates/:id/test-email`
 *
 * Sends the bannered sample certificate email to the acting admin, through the
 * same relay and safety policy as a real delivery. A redirect or allowlist mode
 * rewrites the recipient, and the response reports which address was used.
 */

import type { ActionFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { sendTemplateTestEmail } from "@/server/mail/test-email";
import { json, methodNotAllowed, toErrorResponse } from "@/server/http/api";

export async function action({ request, params }: ActionFunctionArgs) {
	if (request.method !== "POST") return methodNotAllowed();
	try {
		const { user } = await requireApiUser(request);
		const result = await sendTemplateTestEmail(
			{ id: user.id, role: user.role },
			params.id ?? "",
			user.email ?? "",
		);
		return json({
			success: true,
			...result,
			message: `Test email sent to ${result.recipient} (${result.deliveryMode} mode).`,
		});
	} catch (error) { return toErrorResponse(error); }
}

/**
 * A GET on an action-only route is a wrong method, not a server fault.
 * Without this, React Router answers 400 "Unexpected Server Error", which
 * reads like a bug in every log and monitor that sees it.
 */
export function loader() {
	return methodNotAllowed();
}
