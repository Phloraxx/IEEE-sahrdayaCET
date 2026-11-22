import type { LoaderFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { getBatchDelivery } from "@/server/certificates/delivery";
import { json, toErrorResponse } from "@/server/http/api";

export async function loader({ request, params }: LoaderFunctionArgs) {
	try {
		const { user } = await requireApiUser(request);
		return json(await getBatchDelivery({ id: user.id, role: user.role }, params.eventId ?? "", params.batchId ?? ""));
	} catch (error) { return toErrorResponse(error); }
}
