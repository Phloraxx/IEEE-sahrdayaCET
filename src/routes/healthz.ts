import { schedulerStatus } from "@/server/jobs/scheduler.server";
import { renderCacheStats } from "@/server/http/render-cache.server";

export async function loader() {
	return Response.json(
		{ ok: true, service: "web", jobs: schedulerStatus(), renderCache: renderCacheStats() },
		{ headers: { "Cache-Control": "no-store" } },
	);
}
