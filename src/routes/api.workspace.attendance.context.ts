import type { LoaderFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { json, toErrorResponse } from "@/server/http/api";
import { query } from "@/lib/db.server";
import { hasEventCapability } from "@/server/authz/capabilities";
import { loadAssignments } from "@/server/workspace/service";
import { sessionsForEvent, sessionPayload } from "@/server/attendance/service";

/**
 * The events this actor may check people in to, with their sessions.
 *
 * Scoped by `checkin.manage` per event, so a branch admin sees everything and an
 * event volunteer sees only their event.
 */
export async function loader({ request }: LoaderFunctionArgs) {
	try {
		const { user } = await requireApiUser(request);
		const actor = { id: user.id, role: user.role };
		const assignments = await loadAssignments(actor.id);

		const events = await query<{ id: string; title: string | null; society_id: string | null; status: string | null; check_in_enabled: number }>(
			`SELECT id, title, society_id, status, check_in_enabled FROM events
			  WHERE is_deleted = 0 ORDER BY date DESC`,
		);

		const visible = [];
		for (const event of events.rows) {
			if (!hasEventCapability(actor, "checkin.manage", { id: event.id, societyId: event.society_id }, assignments)) {
				continue;
			}
			const sessions = await sessionsForEvent(event.id);
			visible.push({
				id: event.id,
				title: event.title ?? "",
				status: event.status ?? "",
				checkInEnabled: event.check_in_enabled === 1,
				mode: sessions.length ? "sessions" : "legacy",
				sessions: await Promise.all(sessions.map(sessionPayload)),
			});
		}

		return json({ events: visible });
	} catch (error) {
		return toErrorResponse(error);
	}
}
