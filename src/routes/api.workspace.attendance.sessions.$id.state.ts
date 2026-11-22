import type { LoaderFunctionArgs } from "react-router";
import { requireApiUser } from "@/server/auth/session.server";
import { json, toErrorResponse } from "@/server/http/api";
import { query } from "@/lib/db.server";
import { hasEventCapability } from "@/server/authz/capabilities";
import { loadAssignments, WorkspaceError } from "@/server/workspace/service";
import { presentCount, recentAttendance, sessionPayload, type SessionRow } from "@/server/attendance/service";

export async function loader({ request, params }: LoaderFunctionArgs) {
	try {
		const { user } = await requireApiUser(request);
		const actor = { id: user.id, role: user.role };

		const found = await query<SessionRow>(`SELECT * FROM event_sessions WHERE id = ?`, [params.id ?? ""]);
		const session = found.rows[0];
		if (!session) {
			throw new WorkspaceError(404, "SESSION_NOT_FOUND", "Attendance session not found");
		}

		const event = await query<{ id: string; society_id: string | null }>(
			`SELECT id, society_id FROM events WHERE id = ?`,
			[session.event_id],
		);
		const scope = event.rows[0];
		const assignments = await loadAssignments(actor.id);
		if (!scope || !hasEventCapability(actor, "checkin.manage", { id: scope.id, societyId: scope.society_id }, assignments)) {
			throw new WorkspaceError(403, "FORBIDDEN", "You are not assigned to check in this event");
		}

		return json({
			session: await sessionPayload(session),
			presentCount: await presentCount(session.id),
			recent: await recentAttendance(session.id, 20),
		});
	} catch (error) {
		return toErrorResponse(error);
	}
}
