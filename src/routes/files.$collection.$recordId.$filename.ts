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
	// Avatars are public by design: they are the Google profile photos already
	// shown on the public execom and society pages, and PocketBase served them
	// from a public file route too. The filename is a generated UUID and the
	// record id is not a secret, so this exposes nothing the directory does not.
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

/**
 * Widths the client is allowed to ask for. A poster is rendered between ~160px
 * (mobile grid) and ~720px (full-width artwork), so 2048 is already generous
 * and keeps a crafted `?w=60000` from burning CPU.
 */
const MIN_RESIZE_WIDTH = 16;
const MAX_RESIZE_WIDTH = 2048;

/** Formats sharp can re-encode. PDFs and unknown types are served untouched. */
const RESIZABLE = new Set([".jpg", ".jpeg", ".png", ".webp"]);

function parseWidth(raw: string | null): number | null {
	if (!raw) return null;
	if (!/^\d{1,5}$/.test(raw)) return null;
	const width = Number(raw);
	if (width < MIN_RESIZE_WIDTH || width > MAX_RESIZE_WIDTH) return null;
	return width;
}

/**
 * Re-encode one stored image at a requested width.
 *
 * Uploads arrive at whatever resolution the organiser had — one staging poster
 * is 5400x5400 and 3.9 MB while being displayed at 353px wide. Serving a
 * width-appropriate variant is the difference between a 9 MB and a ~1 MB
 * `/events` page. The original bytes stay the source of truth; this only ever
 * produces a derived response.
 */
async function resizeImage(
	filePath: string,
	ext: string,
	width: number,
	acceptsWebp: boolean,
): Promise<{ body: Buffer; contentType: string } | null> {
	const sharp = (await import("sharp")).default;
	const pipeline = sharp(filePath, { failOn: "none" }).rotate().resize({
		width,
		withoutEnlargement: true,
		fit: "inside",
	});

	if (acceptsWebp || ext === ".webp") {
		return { body: await pipeline.webp({ quality: 78, effort: 4 }).toBuffer(), contentType: "image/webp" };
	}
	if (ext === ".png") {
		return { body: await pipeline.png({ compressionLevel: 9 }).toBuffer(), contentType: "image/png" };
	}
	return { body: await pipeline.jpeg({ quality: 80, mozjpeg: true }).toBuffer(), contentType: "image/jpeg" };
}

export async function loader({ params, request }: LoaderFunctionArgs) {
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

	const ext = extname(filename).toLowerCase();
	const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";

	const width = parseWidth(new URL(request.url).searchParams.get("w"));
	if (width && RESIZABLE.has(ext)) {
		const acceptsWebp = (request.headers.get("accept") ?? "").includes("image/webp");
		try {
			const resized = await resizeImage(filePath, ext, width, acceptsWebp);
			if (resized) {
				return new Response(new Uint8Array(resized.body), {
					headers: {
						"Content-Type": resized.contentType,
						"Content-Length": String(resized.body.byteLength),
						// The width is part of the URL, so the bytes for a given URL never
						// change: the same long-lived immutable policy as the original.
						"Cache-Control": "public, max-age=31536000, immutable",
						// The encoding depends on Accept, so a shared cache must key on it.
						Vary: "Accept",
						"X-Content-Type-Options": "nosniff",
					},
				});
			}
		} catch {
			// A corrupt or unreadable image must not 500 the page; fall through to
			// the original bytes, which is what the browser would have got anyway.
		}
	}

	const body = await import("node:fs/promises").then((fs) => fs.readFile(filePath));

	return new Response(new Uint8Array(body), {
		headers: {
			"Content-Type": contentType,
			"Content-Length": String(body.byteLength),
			// Filenames are generated UUIDs and a replaced file gets a new one, so the
			// URL is content-addressed in practice: it can never point at different
			// bytes. `immutable` promises the browser will not revalidate, which is
			// only honest alongside a long max-age — at one day it meant a day of
			// staleness followed by a full re-fetch, the worst of both.
			"Cache-Control": "public, max-age=31536000, immutable",
			"X-Content-Type-Options": "nosniff",
		},
	});
}
