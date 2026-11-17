/**
 * `POST /api/uploads/:collection/:recordId/:field` — one image, one column.
 *
 * Why this exists: the admin forms used to post `multipart/form-data` straight
 * to `/api/collections/:name`, which only parses JSON, so every event, society
 * and execom save was a 400. Files now go through this route and the row is
 * written with JSON, which is the same split the certificate template assets
 * already use (row in the database, bytes on the volume, filename on the row).
 *
 * The route is a *capability* check plus a *column allow-list*: a caller names a
 * collection and a field, never a path. The filename is generated here, so the
 * bytes on disk carry no personal data and cannot be guessed.
 */

import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type { ActionFunctionArgs } from "react-router";
import { query } from "@/lib/db.server";
import { getEnv } from "@/lib/env.server";
import { requireApiUser } from "@/server/auth/session.server";
import { hasCapability, hasEventCapability, type Actor } from "@/server/authz/capabilities";
import { loadAssignments } from "@/server/workspace/service";
import { json, methodNotAllowed, toErrorResponse } from "@/server/http/api";
import { WorkspaceError } from "@/server/workspace/service";

/** Collection -> uploads subdirectory + the file columns it exposes. */
const UPLOADABLE: Record<string, { dir: string; table: string; fields: readonly string[] }> = {
	events: { dir: "events", table: "events", fields: ["banner"] },
	societies: { dir: "societies", table: "societies", fields: ["logo", "banner"] },
	execom: { dir: "execom", table: "execom", fields: ["photo"] },
	users: { dir: "users", table: "users", fields: ["avatar"] },
};

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
	"image/png": ".png",
	"image/jpeg": ".jpg",
	"image/webp": ".webp",
	"image/gif": ".gif",
};

function fail(status: number, code: string, message: string): never {
	throw new WorkspaceError(status, code, message);
}

/** Who may write this column of this row? */
async function authorize(actor: Actor, collection: string, recordId: string): Promise<void> {
	const assignments = await loadAssignments(actor.id);

	if (collection === "users") {
		// A user may replace their own avatar; an admin may replace anyone's.
		if (actor.role !== "admin" && actor.id !== recordId) {
			fail(404, "RECORD_NOT_FOUND", "The requested resource wasn't found.");
		}
		return;
	}

	if (collection === "societies") {
		if (hasCapability(actor, "societies.edit", {}, assignments)) return;
		fail(403, "FORBIDDEN", "You cannot edit this society");
	}

	if (collection === "execom") {
		if (hasCapability(actor, "execom.manage", {}, assignments)) return;
		fail(403, "FORBIDDEN", "You cannot edit the executive committee");
	}

	if (collection === "events") {
		const found = await query<{ id: string; society_id: string | null }>(
			"SELECT id, society_id FROM events WHERE id = ?",
			[recordId],
		);
		const event = found.rows[0];
		if (!event) fail(404, "RECORD_NOT_FOUND", "The requested resource wasn't found.");
		if (hasEventCapability(actor, "events.edit", { id: event.id, societyId: event.society_id }, assignments)) {
			return;
		}
		fail(403, "FORBIDDEN", "You cannot edit this event");
	}

	fail(403, "FORBIDDEN", "You cannot upload here");
}

export async function action({ request, params }: ActionFunctionArgs) {
	if (request.method !== "POST") return methodNotAllowed();
	try {
		const { user } = await requireApiUser(request);
		const collection = params.collection ?? "";
		const recordId = params.recordId ?? "";
		const field = params.field ?? "";

		const spec = UPLOADABLE[collection];
		if (!spec || !spec.fields.includes(field)) {
			return json({ error: "Unknown upload target" }, 404);
		}
		if (!/^[0-9a-f-]{36}$/i.test(recordId)) {
			return json({ error: "Unknown upload target" }, 404);
		}

		await authorize({ id: user.id, role: user.role }, collection, recordId);

		// `spec.table` and `field` are the hard-coded allow-list above, never the
		// request; the regex is a second, independent guard.
		if (!/^[a-z_]+$/.test(spec.table) || !/^[a-z_]+$/.test(field)) {
			return json({ error: "Unknown upload target" }, 404);
		}

		// pi-lens-ignore: sql-injection — table and column come from UPLOADABLE
		// (hard-coded) and are re-checked against an identifier regex; the id is bound.
		const row = await query<Record<string, unknown>>(
			`SELECT * FROM ${spec.table} WHERE id = ?`,
			[recordId],
		);
		if (!row.rows[0]) return json({ error: "The requested resource wasn't found." }, 404);

		const form = await request.formData().catch(() => null);
		const file = form?.get("file");
		if (!(file instanceof File)) return json({ error: "Expected a file field" }, 400);
		if (file.size === 0) return json({ error: "The file is empty" }, 400);
		if (file.size > MAX_BYTES) return json({ error: "The file is larger than 5 MB" }, 413);

		const extension = ALLOWED_TYPES[file.type];
		if (!extension) return json({ error: "Only PNG, JPEG, WebP or GIF images are accepted" }, 415);

		// The extension comes from the MIME type, never from the client filename.
		const filename = `${randomUUID()}${extension}`;
		const uploadsDir = resolve(getEnv().UPLOADS_DIR);
		const recordDir = resolve(join(uploadsDir, spec.dir, recordId));
		if (recordDir !== uploadsDir && !recordDir.startsWith(uploadsDir + sep)) {
			return json({ error: "Unknown upload target" }, 404);
		}

		await mkdir(recordDir, { recursive: true });
		await writeFile(join(recordDir, filename), Buffer.from(await file.arrayBuffer()));

		const previous = String(row.rows[0][field] ?? "");
		// pi-lens-ignore: sql-injection — same allow-listed identifiers as above.
		await query(`UPDATE ${spec.table} SET ${field} = ? WHERE id = ?`, [filename, recordId]);

		// Best effort: a leftover file is harmless, a failed save is not.
		if (previous && previous !== filename) {
			await unlink(join(recordDir, previous)).catch(() => undefined);
		}

		return json({ filename, url: `/files/${spec.dir}/${recordId}/${filename}` }, 201);
	} catch (error) {
		return toErrorResponse(error);
	}
}

export async function loader() {
	return methodNotAllowed();
}

/** Exported for the unit test that keeps the allow-list honest. */
export const __testing = { UPLOADABLE, MAX_BYTES, ALLOWED_TYPES };
