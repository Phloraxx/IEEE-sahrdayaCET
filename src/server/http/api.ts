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

/**
 * Discard an oversized body before refusing it.
 *
 * Answering 413 while the body is still unread leaves the bytes in the
 * connection. Node's parser then treats them as the start of the next request,
 * and through Cloudflare the *next* request on that keep-alive connection comes
 * back as a 502. Reading (up to a bounded amount) keeps the connection honest;
 * beyond the bound we cancel and let the connection close instead.
 */
export async function discardOversizedBody(request: Request, limit = MAX_JSON_BYTES * 4): Promise<void> {
	const body = request.body;
	if (!body) return;
	const reader = body.getReader();
	let read = 0;
	try {
		while (read < limit) {
			const chunk = await reader.read();
			if (chunk.done) return;
			read += chunk.value?.byteLength ?? 0;
		}
	} finally {
		await reader.cancel().catch(() => undefined);
	}
}

function tooLarge(request: Request): boolean {
	const declared = Number(request.headers.get("Content-Length") ?? "0");
	return Number.isFinite(declared) && declared > MAX_JSON_BYTES;
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
	if (tooLarge(request)) {
		await discardOversizedBody(request);
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

/** The result of reading a JSON object under the shared cap. */
export type JsonBodyResult =
	| { ok: true; body: Record<string, unknown> }
	| { ok: false; status: 400 | 413; code: "INVALID_BODY" | "BODY_TOO_LARGE"; error: string };

/**
 * Read a JSON object under `MAX_JSON_BYTES`, without throwing.
 *
 * Routes that answer their own status codes (the collection handlers, the
 * registration command) used to re-declare the cap and the parse rules; three
 * copies drifted. This is the one implementation: a declared body over the cap
 * is drained and refused with 413, and anything that is not a JSON object is a
 * 400 — never silently coerced to `{}`.
 */
export async function readJsonBody(request: Request): Promise<JsonBodyResult> {
	if (tooLarge(request)) {
		await discardOversizedBody(request);
		return { ok: false, status: 413, code: "BODY_TOO_LARGE", error: "Request body is too large" };
	}
	let parsed: unknown;
	try {
		parsed = await request.json();
	} catch {
		return { ok: false, status: 400, code: "INVALID_BODY", error: "Expected a JSON object" };
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		return { ok: false, status: 400, code: "INVALID_BODY", error: "Expected a JSON object" };
	}
	return { ok: true, body: parsed as Record<string, unknown> };
}
