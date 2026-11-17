/**
 * `PUT /api/blogs/:id/authors` — set a post's author list.
 *
 * `blogs.relation` was a PocketBase multi-relation; in SQLite it is the
 * `blog_authors` join table, which the generic collection endpoint cannot write
 * (it has no `id` column and takes one row at a time). This route owns it.
 */

import type { ActionFunctionArgs } from "react-router";
import { query, withTransaction } from "@/lib/db.server";
import { requireApiUser } from "@/server/auth/session.server";
import { hasCapability } from "@/server/authz/capabilities";
import { loadAssignments, WorkspaceError } from "@/server/workspace/service";
import { json, methodNotAllowed, readJson, toErrorResponse } from "@/server/http/api";

/**
 * There is no read side here: the author list is part of the blog record the
 * collection endpoint already returns. Without this loader a GET fell through to
 * the router's error boundary and answered `400 {"message":"Unexpected Server
 * Error"}`, which reads like a bug rather than "wrong method".
 */
export function loader() {
	return methodNotAllowed();
}

export async function action({ request, params }: ActionFunctionArgs) {
	if (request.method !== "PUT" && request.method !== "POST") return methodNotAllowed();
	try {
		const { user } = await requireApiUser(request);
		const blogId = params.id ?? "";

		const assignments = await loadAssignments(user.id);
		if (!hasCapability({ id: user.id, role: user.role }, "content.manage", {}, assignments)) {
			throw new WorkspaceError(403, "FORBIDDEN", "Blog editor access required");
		}

		const blog = await query<{ id: string }>("SELECT id FROM blogs WHERE id = ?", [blogId]);
		if (!blog.rows[0]) throw new WorkspaceError(404, "BLOG_NOT_FOUND", "Blog post not found");

		const body = await readJson(request);
		const userIds = Array.isArray(body.userIds)
			? [...new Set(body.userIds.map((value) => String(value ?? "").trim()).filter(Boolean))]
			: [];

		await withTransaction(async () => {
			await query("DELETE FROM blog_authors WHERE blog_id = ?", [blogId]);
			for (const userId of userIds) {
				const exists = await query<{ id: string }>("SELECT id FROM users WHERE id = ?", [userId]);
				if (!exists.rows[0]) continue;
				await query("INSERT INTO blog_authors (blog_id, user_id) VALUES (?, ?)", [blogId, userId]);
			}
		});

		return json({ blogId, userIds });
	} catch (error) {
		return toErrorResponse(error);
