/** Shared JSON helpers for the API route modules. */

import { WorkspaceError } from "@/server/workspace/service";

export function json(
	body: unknown,
	status = 200,
	extraHeaders: Record<string, string> = {},
): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extraHeaders },
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

/**
 * Largest JSON body any endpoint accepts.
 *
 * There is no framework-level limit, and several routes parse a body before they
 * can decide anything about it, so the cap lives here where every JSON endpoint
 * already funnels through.
 */
export const MAX_JSON_BYTES = 256 * 1024;

function tooLarge(request: Request): boolean {
	const declared = Number(request.headers.get("Content-Length") ?? "0");
	return Number.isFinite(declared) && declared > MAX_JSON_BYTES;
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
	if (tooLarge(request)) {
		throw new WorkspaceError(413, "BODY_TOO_LARGE", "Request body is too large");
	}
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
