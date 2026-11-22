import { schedulerStatus } from "@/server/jobs/scheduler.server";

export async function loader() {
	return Response.json(
		{ ok: true, service: "web", jobs: schedulerStatus() },
		{ headers: { "Cache-Control": "no-store" } },
	);
}
