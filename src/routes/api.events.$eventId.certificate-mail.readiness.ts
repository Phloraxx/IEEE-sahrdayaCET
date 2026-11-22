import type { LoaderFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { mailReadinessForEvent } from "@/server/certificates/delivery";
import { json, toErrorResponse } from "@/server/http/api";

export async function loader({ request, params }: LoaderFunctionArgs) {
	try {
		const { user } = await requireApiUser(request);
		return json(await mailReadinessForEvent({ id: user.id, role: user.role }, params.eventId ?? ""));
	} catch (error) { return toErrorResponse(error); }
}
