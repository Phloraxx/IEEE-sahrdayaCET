/**
 * Readiness — "is this deployment able to serve its job?" — as opposed to
 * liveness, "is the process still running?".
 *
 * The rule this module now enforces, revised 2026-11-24 after review: **a
 * recoverable side job must never take the site out of rotation**. A stale
 * backup, a job runner that has paused, or a failed mail pass is something an
 * operator has to fix, and it is a real alert — but the public site, the admin
 * workspace and every read and write that does not depend on that job still
 * work. Marking the whole deployment unready for it would close the container,
 * stop the very runner that retries, and turn a fixable problem into an outage.
 *
 * So the report has two layers:
 *
 *   `ready`      minimum viable service, and the only thing that drives the HTTP
 *                status: the database opens, answers `SELECT 1` and its schema
 *                is at least what this build requires; and the process knows
 *                which build it is (identity resolved, not a bare guess).
 *   diagnostics  everything else — job-runner freshness, backup cadence, the
 *                last job error, integration state. Reported with the same
 *                names and reasons, surfaced on the admin data-health page and
 *                the watchdog, and never asserted by `/healthz`.
 *
 * Two shapes come out of it, deliberately:
 *
 *   `readinessProbe()`     public. Status, environment, build fingerprint and
 *                          check names. Never a path, a hostname, an error
 *                          string or a stack.
 *   `readinessReport()`    the whole thing. Authenticated admin surface only,
 *                          plus the watchdog; this is where reason text lives.
 *
 * Nothing here probes an external service. The checks read what the caller
 * already has in hand, so a readiness call cannot itself cause traffic, a login,
 * a payment or a network request.
 */

import { buildFingerprint, buildIdentity, type BuildIdentity } from "@/server/build-identity.server";

export type CheckStatus = "ok" | "fail" | "warn";

/** Whether a check can take the deployment out of rotation. */
export type CheckRole = "readiness" | "diagnostic";

export interface ReadinessCheck {
	/** Stable machine name. Safe to publish. */
	name: string;
	status: CheckStatus;
	/**
	 * Why it is not `ok`. Internal detail — the public probe never serialises
	 * this field; the admin view and the watchdog do.
	 */
	detail: string;
	/** `readiness` gates the HTTP status; `diagnostic` never does. */
	role: CheckRole;
}

export interface ReadinessDependencies {
	/** `SELECT 1` against the application's own connection. Throws when unwritable. */
	probeDatabase: () => Promise<void>;
	/**
	 * Confirm the schema this build needs is present.
	 *
	 * Returns the applied `PRAGMA user_version` and the required one, or throws
	 * when the database cannot answer. A schema *newer* than this build is not a
	 * failure (a rollback of the image against a migrated database is a separate,
	 * documented decision); older than required is.
	 */
	probeSchema?: () => Promise<{ applied: number; required: number }>;
	/** Newest scheduler tick, in ms since epoch; 0 when it never ran. */
	lastTickMs: () => number;
	/** The job runner's last recorded error, verbatim. `""` when none. */
	lastError: () => string;
	/** Whether the job runner is supposed to be running in this process. */
	expectJobs: boolean;
	/** Newest backup archive for this environment, in ms since epoch; 0 when none. */
	latestBackupMs: () => number;
	/** Now, injectable so a test does not have to sleep. */
	now?: () => number;
}

export interface ReadinessReport {
	/** Minimum viable service. The only value that drives the HTTP status. */
	ready: boolean;
	status: "ok" | "unavailable";
	environment: string;
	identity: BuildIdentity;
	/** Empty when the build carried no commit. */
	fingerprint: string;
	checkedAt: string;
	checks: ReadinessCheck[];
	/** True when any `readiness` check failed. Convenience for a caller. */
	blocked: boolean;
	/** True when any `diagnostic` check is not `ok`, whatever readiness says. */
	degraded: boolean;
}

/** A tick older than this is a stopped clock, not a slow minute. */
export const TICK_STALE_MS = 15 * 60 * 1000;
/** A backup older than this is past its daily cadence and its one-hour retry. */
export const BACKUP_STALE_MS = 36 * 60 * 60 * 1000;

/**
 * Evaluate every check. Never throws: a probe that can throw is a probe that
 * takes the endpoint down with it.
 */
export async function readinessReport(deps: ReadinessDependencies): Promise<ReadinessReport> {
	const nowMs = (deps.now ?? Date.now)();
	const checks: ReadinessCheck[] = [];

	// --- readiness ---------------------------------------------------------
	try {
		await deps.probeDatabase();
		checks.push({ name: "database", status: "ok", detail: "", role: "readiness" });
	} catch (error) {
		checks.push({
			name: "database",
			status: "fail",
			detail: error instanceof Error ? error.message : String(error),
			role: "readiness",
		});
	}

	if (deps.probeSchema) {
		try {
			const { applied, required } = await deps.probeSchema();
			if (Number.isFinite(required) && applied < required) {
				checks.push({
					name: "schema",
					status: "fail",
					detail: `database schema is at version ${applied}; this build needs ${required}`,
					role: "readiness",
				});
			} else {
				checks.push({ name: "schema", status: "ok", detail: "", role: "readiness" });
			}
		} catch (error) {
			// A schema probe that cannot answer is a database problem, already
			// covered above; do not fail readiness twice for one cause.
			checks.push({
				name: "schema",
				status: "warn",
				detail: `schema version could not be read: ${error instanceof Error ? error.message : String(error)}`,
				role: "diagnostic",
			});
		}
	}

	const identity = buildIdentity();
	// Identity is only a gate when the build *has* an identity to check. A source
	// build is a documented, valid deployment; it is not a reason to refuse traffic.
	if (identity.commit) {
		checks.push({ name: "identity", status: "ok", detail: "", role: "readiness" });
	} else {
		checks.push({
			name: "identity",
			status: "warn",
			detail: "this build carries no commit; the deployment cannot be matched to a release",
			role: "diagnostic",
		});
	}

	// --- diagnostics -------------------------------------------------------
	if (deps.expectJobs) {
		const lastTick = deps.lastTickMs();
		const lastError = deps.lastError();
		const age = lastTick ? nowMs - lastTick : Number.POSITIVE_INFINITY;
		if (!lastTick) {
			checks.push({
				name: "jobs",
				status: "fail",
				detail: "the job runner has not ticked yet",
				role: "diagnostic",
			});
		} else if (age > TICK_STALE_MS) {
			checks.push({
				name: "jobs",
				status: "fail",
				detail: `the job runner has not ticked for ${Math.round(age / 60_000)} min`,
				role: "diagnostic",
			});
		} else if (lastError) {
			checks.push({ name: "jobs", status: "warn", detail: lastError, role: "diagnostic" });
		} else {
			checks.push({ name: "jobs", status: "ok", detail: "", role: "diagnostic" });
		}
	} else {
		// Jobs off is a configuration, not a fault: staging runs without them by
		// design and a cron-driven host may too.
		checks.push({
			name: "jobs",
			status: "ok",
			detail: "not enabled in this process",
			role: "diagnostic",
		});
	}

	const lastBackup = deps.latestBackupMs();
	if (!lastBackup) {
		// Before the first archive exists (a fresh staging copy, or minutes after
		// the first boot) there is nothing to judge.
		checks.push({ name: "backups", status: "ok", detail: "no archive yet", role: "diagnostic" });
	} else if (nowMs - lastBackup > BACKUP_STALE_MS) {
		checks.push({
			name: "backups",
			status: "fail",
			detail: `the newest archive is ${Math.round((nowMs - lastBackup) / 3_600_000)} h old`,
			role: "diagnostic",
		});
	} else {
		checks.push({ name: "backups", status: "ok", detail: "", role: "diagnostic" });
	}

	const blocked = checks.some((check) => check.role === "readiness" && check.status === "fail");
	return {
		ready: !blocked,
		status: blocked ? "unavailable" : "ok",
		environment: identity.environment,
		identity,
		fingerprint: buildFingerprint(identity),
		checkedAt: new Date(nowMs).toISOString(),
		checks,
		blocked,
		degraded: checks.some(
			(check) => check.role === "diagnostic" && check.status !== "ok",
		),
	};
}

/**
 * The public projection.
 *
 * A probe needs status, which deployment it is looking at, and — when a rollback
 * or a deploy gate is in flight — whether that deployment is the release that
 * was just shipped. It does not need a table name, a database path, an SMTP
 * host, an error message or a commit SHA.
 */
export interface ReadinessProbe {
	/** Readiness only. A stale backup or paused job does not change this. */
	ok: boolean;
	status: "ok" | "unavailable";
	/** What answers, so a misrouted probe is obvious. */
	service: "web";
	environment: string;
	/** 16 hex characters, or `""` for a build that carried no commit. */
	build: string;
	/** Every check's status by name, readiness and diagnostic alike. */
	checks: Record<string, CheckStatus>;
	/** True when a diagnostic is not `ok`; informational, never a 503. */
	degraded: boolean;
	/**
	 * Public HTML cache size: entries and bytes only.
	 *
	 * Not the hit/miss counters — those describe traffic and belong on the admin
	 * page. Size is operational weather (it shows the cache is working and bounded)
	 * and disclosing it costs nothing.
	 */
	renderCache?: { entries: number; bytes: number };
	at: string;
}

export function readinessProbe(
	report: ReadinessReport,
	renderCache?: { entries: number; bytes: number },
): ReadinessProbe {
	const checks: Record<string, CheckStatus> = {};
	for (const check of report.checks) checks[check.name] = check.status;
	return {
		ok: report.ready,
		status: report.status,
		service: "web",
		environment: report.environment,
		build: report.fingerprint,
		checks,
		degraded: report.degraded,
		...(renderCache ? { renderCache } : {}),
		at: report.checkedAt,
	};
}
