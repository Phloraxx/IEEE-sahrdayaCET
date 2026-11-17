/** Shared JSON helpers for the API route modules. */

import { WorkspaceError } from "@/server/workspace/service";

export function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
	});
}

export function methodNotAllowed(): Response {
	return json({ error: "Method not allowed" }, 405);
}

/**
 * Turn a thrown error into a response.
 *
 * `WorkspaceError` carries a status and a machine code; anything else is a 500
 * and its message is not echoed to the client.
 */
export function toErrorResponse(error: unknown): Response {
	if (error instanceof WorkspaceError) {
		return json({ error: error.message, code: error.code }, error.status);
	}
	if (error instanceof Response) return error;
	console.error("[api] unhandled error:", error);
	return json({ error: "Internal server error" }, 500);
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
	try {
		const body = (await request.json()) as unknown;
		if (!body || typeof body !== "object" || Array.isArray(body)) {
			throw new Error("not an object");
		}
		return body as Record<string, unknown>;
	} catch {
		throw new WorkspaceError(400, "INVALID_BODY", "Expected a JSON object");
	}
}
