import type { LoaderFunctionArgs } from "react-router";
import { renderBase } from "@/server/certificates/public";
import { toErrorResponse } from "@/server/http/api";

const NO_STORE = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export async function loader({ request, params }: LoaderFunctionArgs) {
	try {
		const asset = await renderBase(request, params.token ?? "");
		return new Response(new Uint8Array(asset.body), {
			status: 200,
			headers: { "Content-Type": asset.contentType, ...NO_STORE },
		});
	} catch (error) {
		return toErrorResponse(error);
	}
}
