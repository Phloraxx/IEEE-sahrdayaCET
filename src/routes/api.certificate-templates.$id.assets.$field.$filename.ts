/**
 * `GET /api/certificate-templates/:id/assets/:field/:filename`
 *
 * The only way to read certificate template artwork. Protected on four counts:
 * a session is required, the actor needs `certificates.view` for the template's
 * event, the field must be one of the three known asset columns, and the
 * filename must be the one stored on that row. Every failure is a 404 so a probe
 * cannot distinguish "exists but forbidden" from "does not exist".
 */

import type { LoaderFunctionArgs } from "react-router";
import { getSessionUser } from "@/server/auth/session.server";
import { resolveAsset } from "@/server/certificates/templates";
import { toErrorResponse } from "@/server/http/api";

export async function loader({ request, params }: LoaderFunctionArgs) {
	try {
		const context = await getSessionUser(request);
		const actor = context ? { id: context.user.id, role: context.user.role } : null;
		const asset = await resolveAsset(actor, params.id ?? "", params.field ?? "", params.filename ?? "");
		return new Response(new Uint8Array(asset.body), {
			status: 200,
			headers: {
				"Content-Type": asset.contentType,
				"Cache-Control": "private, no-store",
				"X-Content-Type-Options": "nosniff",
			},
		});
	} catch (error) { return toErrorResponse(error); }
}
