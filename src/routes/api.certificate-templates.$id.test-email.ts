/**
 * `POST /api/certificate-templates/:id/test-email`
 *
 * Records a would-have-sent test email. Nothing is transmitted: the port has no
 * mail transport, by design, so staging can exercise the path without emailing
 * a real student.
 */

import type { ActionFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { getTemplate } from "@/server/certificates/templates";
import { mailReadiness } from "@/server/certificates/delivery";
import { json, methodNotAllowed, toErrorResponse } from "@/server/http/api";

export async function action({ request, params }: ActionFunctionArgs) {
	if (request.method !== "POST") return methodNotAllowed();
	try {
		const { user } = await requireApiUser(request);
		// Reuses the template read, which enforces the capability check.
		await getTemplate({ id: user.id, role: user.role }, params.id ?? "");
		return json({
			success: true,
			recipient: user.email ?? "",
			deliveryMode: mailReadiness().mode,
			provider: "stub",
			stubbed: true,
			message: "Test email recorded as would-have-sent; nothing was transmitted.",
		});
	} catch (error) { return toErrorResponse(error); }
}
