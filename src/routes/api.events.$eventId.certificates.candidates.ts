import type { LoaderFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { listCandidates } from "@/server/certificates/issuance";
import { json, toErrorResponse } from "@/server/http/api";

export async function loader({ request, params }: LoaderFunctionArgs) {
	try {
		const { user } = await requireApiUser(request);
		return json(await listCandidates({ id: user.id, role: user.role }, params.eventId ?? ""));
	} catch (error) { return toErrorResponse(error); }
}
