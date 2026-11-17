/**
 * File uploads for the admin forms.
 *
 * The collections endpoint is JSON-only, so a form that carries a file has to
 * split: the row is written with JSON, then the bytes go to
 * `/api/uploads/:collection/:recordId/:field`, which validates the capability,
 * the column and the image type, and writes a generated filename onto the row.
 */

import { getPbClient } from "@/lib/pb-client";

/** Split a `FormData` into a JSON payload and the files it carried. */
export function splitFormData(form: FormData): {
	payload: Record<string, unknown>;
	files: Array<{ field: string; file: File }>;
} {
	const payload: Record<string, unknown> = {};
	const files: Array<{ field: string; file: File }> = [];
	for (const [key, value] of form.entries()) {
		if (value instanceof File) {
			if (value.size > 0) files.push({ field: key, file: value });
			continue;
		}
		if (key in payload) {
			const existing = payload[key];
			payload[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
			continue;
		}
		payload[key] = value;
	}
	return { payload, files };
}

/** Upload one file and return the generated filename now stored on the row. */
export async function uploadFile(
	collection: string,
	recordId: string,
	field: string,
	file: File,
): Promise<string> {
	const body = new FormData();
	body.append("file", file);
	const result = await getPbClient().send<{ filename: string }>(
		`/api/uploads/${encodeURIComponent(collection)}/${encodeURIComponent(recordId)}/${encodeURIComponent(field)}`,
		{ method: "POST", body },
	);
	return result.filename;
}
