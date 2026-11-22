/**
 * `GET /api/session` — who is signed in, for the client.
 *
 * Replaces the PocketBase `authStore`: the browser no longer holds a token it
 * can read, only an HttpOnly cookie, so the client asks the server who it is.
 */

import type { LoaderFunctionArgs } from "react-router";
import { getSessionUser } from "@/server/auth/session.server";
import { effectiveCapabilities, type Actor } from "@/server/authz/capabilities";
import { query } from "@/lib/db.server";

export async function loader({ request }: LoaderFunctionArgs) {
	const context = await getSessionUser(request);
	if (!context) {
		return new Response(JSON.stringify({ user: null }), {
			status: 200,
			headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
		});
	}

	const { user } = context;

	// Effective capabilities are resolved server-side so the UI can hide actions
	// it would not be allowed to perform — never as the authorization check.
	const assignments = await query<{
		id: string;
		user_id: string;
		role_code: string;
		scope_type: string;
		society_id: string | null;
		event_id: string | null;
		active: number;
		starts_at: string | null;
		ends_at: string | null;
		source: string | null;
	}>(
		`SELECT id, user_id, role_code, scope_type, society_id, event_id, active, starts_at, ends_at, source
		   FROM organization_assignments WHERE user_id = ? AND active = 1`,
		[user.id],
	);

	const actor: Actor = { id: user.id, role: user.role };
	const capabilities = effectiveCapabilities(
		actor,
		assignments.rows.map((row) => ({
			id: row.id,
			userId: row.user_id,
			roleCode: row.role_code,
			scopeType: row.scope_type,
			societyId: row.society_id,
			eventId: row.event_id,
			active: row.active === 1,
			startsAt: row.starts_at,
			endsAt: row.ends_at,
			source: row.source,
		})),
	);

	return new Response(
		JSON.stringify({
			user: {
				id: user.id,
				email: user.email,
				name: user.name ?? user.display_name ?? undefined,
				role: user.role,
				avatar: user.avatar ? `/files/users/${user.id}/${user.avatar}` : undefined,
			},
			capabilities,
		}),
		{ status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
	);
}
