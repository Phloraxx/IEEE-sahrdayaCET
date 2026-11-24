/**
 * `/healthz` — readiness, not liveness.
 *
 * Three callers, one answer:
 *
 *   - Docker's healthcheck (30 s, `wget -qO-`): a failing body closes the
 *     container, which is what makes a broken deploy visible to `docker ps`,
 *     Dokploy and `scripts/ieee-ops-watchdog.sh`;
 *   - `scripts/deploy-local.sh` after it switches the container: it compares the
 *     response against the commit it just built, so a container that did not
 *     actually change is not reported as a deploy;
 *   - an external probe (production-health.yml), which gets the same document
 *     from the public host, so "the process answers" and "the deployment can
 *     serve" are the same question.
 *
 * What it does not do is leak. The public document carries status, environment,
 * a build fingerprint and the status of each check — never a path, a host, an
 * error string, a commit SHA or a count. Reasons live in the authenticated
 * admin data-health view (`readinessReport()`), which is the only surface that
 * needs them.
 *
 * The 503 is deliberate even for a browser: a visitor hitting `/healthz` during
 * an outage should see the same thing a probe sees. `Cache-Control: no-store`
 * keeps an intermediary from pinning either answer.
 */

import { query } from "@/lib/db.server";
import { latestBackupMs } from "@/server/jobs/backup";
import { schedulerStatus } from "@/server/jobs/scheduler.server";
import { renderCacheStats } from "@/server/http/render-cache.server";
import { readinessProbe, readinessReport } from "@/server/readiness.server";

/**
 * Minimum viable database: the connection answers.
 *
 * This is the whole readiness gate on the data path. Schema compatibility is
 * already enforced at boot and at first use by `ensureSchema()` in
 * `src/lib/db.server.ts`, which throws — and therefore stops the process serving
 * — when the file cannot be brought to this build's version or lacks a required
 * column. Re-asking `PRAGMA user_version` here would duplicate that rule in a
 * second place and make the health endpoint a schema authority it should not be.
 */
async function probeDatabase(): Promise<void> {
	await query("SELECT 1 AS ok");
}

export async function loader() {
	const report = await readinessReport({
		probeDatabase,
		lastTickMs: () => {
			const at = schedulerStatus().lastTickAt;
			return at ? Date.parse(at) : 0;
		},
		lastError: () => schedulerStatus().lastError,
		expectJobs: schedulerStatus().enabled,
		latestBackupMs,
	});

	// A stale backup or a paused runner is reported in the body (`degraded`, and
	// the `checks` map) and alerted on by the watchdog and the admin page; it
	// does not close the container. See src/server/readiness.server.ts.
	const stats = renderCacheStats();
	return Response.json(readinessProbe(report, { entries: stats.entries, bytes: stats.bytes }), {
		status: report.ready ? 200 : 503,
		headers: {
			"Cache-Control": "no-store",
			// Never let a ready answer be pinned by an edge or a browser: a deploy
			// gate that reads a cached 200 is not a gate.
			"X-Robots-Tag": "noindex, nofollow",
		},
	});
}
