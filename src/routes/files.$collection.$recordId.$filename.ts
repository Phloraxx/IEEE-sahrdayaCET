/**
 * `GET /files/{collection}/{recordId}/{filename}` — serve a stored file.
 *
 * Replaces PocketBase's `/api/files/...`. The security model is the portal's:
 *
 *   1. **Collection allow-list.** Only the four public file collections are
 *      reachable here. Protected certificate artwork is *not* served by this
 *      route; it needs a capability check and lands in a later phase.
 *   2. **Filename is pinned to the row.** The requested filename must equal the
 *      value stored on the record, so guessing a path cannot reach a file that
 *      belongs to a different record.
 *   3. **Record visibility is re-checked.** A banner on a draft or deleted event
 *      is not served, even though the bytes exist on disk.
 *   4. **Path containment.** The resolved path must stay inside the uploads
 *      volume, so a crafted filename cannot escape it.
 *
 * Filenames are generated UUIDs at migration time, so they carry no personal
 * data and cannot collide.
 */

import { existsSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import type { LoaderFunctionArgs } from "react-router";
import { query } from "@/lib/db.server";
import { getEnv } from "@/lib/env.server";

const NOT_FOUND = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

/** Collection -> uploads subdirectory. Mirrors the migration's UPLOAD_DOMAIN. */
const PUBLIC_COLLECTIONS: Record<
	string,
	{ dir: string; table: string; columns: readonly string[] }
> = {
	events: { dir: "events", table: "events", columns: ["banner"] },
	// A society has two file columns that share one directory, so both are checked.
	societies: { dir: "societies", table: "societies", columns: ["logo", "banner"] },
	execom: { dir: "execom", table: "execom", columns: ["photo"] },
	users: { dir: "users", table: "users", columns: ["avatar"] },
};

const CONTENT_TYPES: Record<string, string> = {
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".png": "image/png",
	".webp": "image/webp",
	".gif": "image/gif",
	".pdf": "application/pdf",
};

function notFound(): Response {
	return new Response("Not found", { status: 404, headers: NOT_FOUND });
}

/**
 * Is this record allowed to be served publicly?
 *
 * `societies` has two file columns (logo, banner) but one visibility rule, so
 * the check is on the record rather than the column.
 */
async function isPubliclyVisible(
	collection: string,
	recordId: string,
	filename: string,
): Promise<boolean> {
	const spec = PUBLIC_COLLECTIONS[collection];
	if (!spec) return false;

	// Column names come from the allow-list above, never from the request.
	const columnMatch = spec.columns.map((column) => `${column} = ?`).join(" OR ");
	const visibility =
		collection === "events"
			? "AND is_deleted = 0 AND status IN ('published', 'completed')"
			: collection === "societies"
				? "AND is_hidden = 0"
				: "";

	const result = await query<{ n: number }>(
		`SELECT count(*) AS n FROM ${spec.table}
		  WHERE id = ? AND (${columnMatch}) ${visibility}`,
		[recordId, ...spec.columns.map(() => filename)],
	);
	return (result.rows[0]?.n ?? 0) > 0;
}

export async function loader({ params }: LoaderFunctionArgs) {
	const collection = String(params.collection ?? "");
	const recordId = String(params.recordId ?? "");
	const filename = String(params.filename ?? "");

	const spec = PUBLIC_COLLECTIONS[collection];
	if (!spec || !recordId || !filename) throw notFound();

	// Reject anything that is not a plain generated filename.
	if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
		throw notFound();
	}
	if (!/^[A-Za-z0-9._-]+$/.test(filename)) throw notFound();

	if (!(await isPubliclyVisible(collection, recordId, filename))) {
		throw notFound();
	}

	const uploadsDir = resolve(getEnv().UPLOADS_DIR);
	const filePath = resolve(join(uploadsDir, spec.dir, recordId, filename));

	// Path containment: the resolved path must sit inside the uploads volume.
	if (filePath !== uploadsDir && !filePath.startsWith(uploadsDir + sep)) {
		throw notFound();
	}
	if (!existsSync(filePath) || !statSync(filePath).isFile()) throw notFound();

	const contentType = CONTENT_TYPES[extname(filename).toLowerCase()] ?? "application/octet-stream";
	const body = await import("node:fs/promises").then((fs) => fs.readFile(filePath));

	return new Response(new Uint8Array(body), {
		headers: {
			"Content-Type": contentType,
			"Content-Length": String(body.byteLength),
			// Generated filenames never change for a given record, so this is safe
			// to cache; a replaced banner gets a new UUID.
			"Cache-Control": "public, max-age=86400, immutable",
			"X-Content-Type-Options": "nosniff",
		},
	});
}
