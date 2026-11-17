import type { LoaderFunctionArgs } from "react-router";
import { renderManifest } from "@/server/certificates/public";
import { json, toErrorResponse } from "@/server/http/api";

const NO_STORE = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export async function loader({ request, params }: LoaderFunctionArgs) {
	try {
		return json(await renderManifest(request, params.token ?? ""), 200, NO_STORE);
	} catch (error) {
		return toErrorResponse(error);
	}
}
