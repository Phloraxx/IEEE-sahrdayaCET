import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { MAX_JSON_BYTES, readJsonBody } from "@/server/http/api";

/**
 * The HTTP boundary the collection handlers, the registration command and the
 * upload route share.
 *
 * The cap used to be re-declared in each route that parsed its own body, and the
 * copies drifted: the collection endpoint had no cap at all. `readJsonBody` is
 * now the one reader, and these tests pin what it accepts and what it refuses
 * without a running server.
 */

function jsonRequest(body: string, headers: Record<string, string> = {}): Request {
	return new Request("http://internal/api", {
		method: "POST",
		headers: { "Content-Type": "application/json", ...headers },
		body,
	});
}

describe("shared JSON body reader", () => {
	it("accepts a JSON object", async () => {
		await expect(readJsonBody(jsonRequest('{"title":"Workshop"}'))).resolves.toEqual({
			ok: true,
			body: { title: "Workshop" },
		});
	});

	it("refuses a body that declares more than the cap, with 413", async () => {
		const request = jsonRequest("{}", { "Content-Length": String(MAX_JSON_BYTES + 1) });
		await expect(readJsonBody(request)).resolves.toMatchObject({ ok: false, status: 413, code: "BODY_TOO_LARGE" });
	});

	it("refuses an array, a scalar and malformed JSON, with 400", async () => {
		for (const body of ["[]", '"text"', "1", "null", "{not json"]) {
			await expect(readJsonBody(jsonRequest(body))).resolves.toMatchObject({ ok: false, status: 400, code: "INVALID_BODY" });
		}
	});

	it("keeps the documented cap at 256 KiB", () => {
		// Other routes and docs quote this number; change them together.
		expect(MAX_JSON_BYTES).toBe(256 * 1024);
	});
});

describe("upload route envelope", () => {
	it("caps the whole multipart request above the single-image cap", async () => {
		const module = await import("@/routes/api.uploads.$collection.$recordId.$field");
		const { MAX_BYTES, MAX_REQUEST_BYTES } = module.__testing;
		expect(MAX_BYTES).toBe(5 * 1024 * 1024);
		expect(MAX_REQUEST_BYTES).toBeGreaterThan(MAX_BYTES);
		expect(MAX_REQUEST_BYTES).toBeLessThanOrEqual(MAX_BYTES + 1024 * 1024);
	});

	it("reads the upload size checks before parsing the multipart body", () => {
		// The route must refuse an oversized envelope before `request.formData()`
		// buffers it. A structural check is the honest way to pin ordering here:
		// look for the call, not a mention of the constant.
		const source = readFileSync(
			resolve(process.cwd(), "src/routes/api.uploads.$collection.$recordId.$field.ts"),
			"utf8",
		);
		const envelopeCheck = source.indexOf("envelopeBytes > MAX_REQUEST_BYTES");
		const parse = source.indexOf("await request.formData()");
		expect(envelopeCheck).toBeGreaterThan(-1);
		expect(parse).toBeGreaterThan(-1);
		expect(envelopeCheck).toBeLessThan(parse);
	});
});
