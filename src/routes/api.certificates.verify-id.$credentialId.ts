import type { LoaderFunctionArgs } from "react-router";
import { verifyByCredentialId } from "@/server/certificates/public";
import { json } from "@/server/http/api";

const NO_STORE = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export async function loader({ params }: LoaderFunctionArgs) {
	try {
		const payload = await verifyByCredentialId(params.credentialId ?? "");
		return json(payload, 200, NO_STORE);
	} catch {
		return json({ status: "INVALID" }, 404, NO_STORE);
	}
}
