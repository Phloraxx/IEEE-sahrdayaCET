/**
 * In-process job runner.
 *
 * The app is a single Node process, so it can own its clock. Every wall-clock
 * minute this runner asks "is anything due?" and runs the passes that used to be
 * host cron entries:
 *
 *   every minute   notification outbox (bounded, quota-guarded), payment expiry
 *   hourly         session pruning
 *   daily          SQLite snapshot + uploads archive, rotated
 *   weekly         `PRAGMA optimize` + a WAL checkpoint
 *
 * Why in-process: the timer then ships with the app, reads the same environment
 * and dies with it. There is no host file to drift, and a deploy cannot leave a
 * timer pointing at a container that no longer exists (the failure that silently
 * stopped staging's reconciler for four days).
 *
 * The limits that come with that choice, and how they are handled:
 *
 *   - **One process only.** Compose runs a single web container. If it is ever
 *     scaled, the outbox claim/lease still prevents duplicate sends, but backups
 *     would race; `BACKUP_DIR` is checked per environment and archives are
 *     uniquely named, so the worst case is a redundant archive, not corruption.
 *   - **The driver is synchronous.** Jobs keep SQLite work small and short, take
 *     the backup snapshot on a separate connection, and run `tar` as a child
 *     process. Nothing here holds the event loop for a human-noticeable time.
 *   - **A deploy restarts the clock.** `isDue` compares against the last run
 *     (or the newest archive on disk), so a restart delays a job instead of
 *     skipping it.
 *   - **A running tick is never overlapped.** The next wake is scheduled after
 *     the previous one finishes, aligned to the minute boundary.
 */

import { isDue, msUntilNextMinute, DAY_MS, HOUR_MS, WEEK_MS } from "./clock";
import { backupDirectory, latestBackupMs, runBackup } from "./backup";
import { runOutboxPass } from "@/server/mail/worker";
import { reconcileExpiredRegistrations } from "@/server/payments/reconcile";
import { pruneExpiredSessions } from "@/server/auth/session.server";
import { runMaintenance } from "@/lib/db.server";

const MAIL_BATCH = 25;
const SHUTDOWN_GRACE_MS = 8_000;
const BACKUP_RETRY_MS = HOUR_MS;

interface SchedulerState {
	enabled: boolean;
	running: boolean;
	stopping: boolean;
	startedAt: string;
	lastTickAt: string;
	lastError: string;
	lastBackupAt: string;
	sessionsAt: number;
	maintenanceAt: number;
	backupRetryAt: number;
	timer: ReturnType<typeof setTimeout> | null;
	signalsRegistered: boolean;
}

interface SchedulerGlobal {
	__ieeeJobs?: SchedulerState;
}

const globalForJobs = globalThis as typeof globalThis & SchedulerGlobal;

function initialState(): SchedulerState {
	return {
		enabled: false,
		running: false,
		stopping: false,
		startedAt: "",
		lastTickAt: "",
		lastError: "",
		lastBackupAt: "",
		sessionsAt: 0,
		maintenanceAt: 0,
		backupRetryAt: 0,
		timer: null,
		signalsRegistered: false,
	};
}

function state(): SchedulerState {
	if (!globalForJobs.__ieeeJobs) globalForJobs.__ieeeJobs = initialState();
	return globalForJobs.__ieeeJobs;
}

/** On in production; `JOBS_ENABLED=1` forces it on for a local/staging probe. */
export function jobsEnabled(): boolean {
	const flag = String(process.env.JOBS_ENABLED ?? "").trim().toLowerCase();
	if (flag === "0" || flag === "false" || flag === "off") return false;
	return process.env.NODE_ENV === "production" || flag === "1" || flag === "true" || flag === "on";
}

function log(message: string, detail?: Record<string, unknown>): void {
	const suffix = detail ? ` ${JSON.stringify(detail)}` : "";
	console.log(`[jobs] ${message}${suffix}`);
}

async function safe(name: string, fn: () => Promise<void>): Promise<void> {
	try {
		await fn();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		const current = state();
		current.lastError = `${name}: ${message}`;
		console.error(`[jobs] ${name} failed: ${message}`);
	}
}

async function runSessions(now: number): Promise<void> {
	const current = state();
	if (!isDue(current.sessionsAt, now, HOUR_MS)) return;
	await safe("sessions", async () => {
		const removed = await pruneExpiredSessions();
		current.sessionsAt = now;
		if (removed > 0) log("pruned expired sessions", { removed });
	});
}

async function runBackupIfDue(now: number): Promise<void> {
	const current = state();
	if (now < current.backupRetryAt) return;

	const newest = Math.max(latestBackupMs(), current.lastBackupAt ? Date.parse(current.lastBackupAt) : 0);
	if (!isDue(newest, now, DAY_MS)) return;

	await safe("backup", async () => {
		const result = await runBackup();
		current.lastBackupAt = new Date(now).toISOString();
		current.backupRetryAt = 0;
		log("backup written", {
			archive: result.archive,
			bytes: result.bytes,
			dbBytes: result.dbBytes,
			uploadFiles: result.uploadFiles,
			pruned: result.pruned,
		});
	});

	// A failed backup retries in an hour, not on every tick.
	if (current.lastError.startsWith("backup:")) current.backupRetryAt = now + BACKUP_RETRY_MS;
}

async function runMaintenanceIfDue(now: number): Promise<void> {
	const current = state();
	if (!isDue(current.maintenanceAt, now, WEEK_MS)) return;
	await safe("maintenance", async () => {
		await runMaintenance();
		current.maintenanceAt = now;
		log("database maintenance complete");
	});
}

/** One pass, no scheduling. Exported so a restart or a test can force it. */
export async function runJobsTickOnce(): Promise<void> {
	const current = state();
	const now = Date.now();
	current.lastTickAt = new Date(now).toISOString();

	await safe("mail", async () => {
		const result = await runOutboxPass({ limit: MAIL_BATCH });
		if (result.sent || result.failed || result.capped) {
			log("mail pass", {
				scanned: result.scanned,
				sent: result.sent,
				failed: result.failed,
				blocked: result.blocked,
				capped: result.capped,
			});
		}
	});

	await safe("payments", async () => {
		// The pass reads each due reservation's provider state, bounded in time
		// and count, so a lost webhook is recovered without ever releasing a
		// transaction the provider still holds. An unavailable provider keeps
		// the seats and is retried on the next minute.
		const result = await reconcileExpiredRegistrations();
		if (result.scanned || result.released || result.confirmed || result.keptForProvider) {
			log("payment reconciliation", {
				scanned: result.scanned,
				polled: result.polled,
				confirmed: result.confirmed,
				released: result.released,
				keptForProvider: result.keptForProvider,
				readsDisabled: result.readsDisabled,
			});
		}
	});

	await runSessions(now);
	await runBackupIfDue(now);
	await runMaintenanceIfDue(now);
}

function schedule(): void {
	const current = state();
	if (current.stopping) return;
	current.timer = setTimeout(() => {
		current.timer = null;
		void tick();
	}, msUntilNextMinute(Date.now()));
	// Never keep a short-lived process (a test or a CLI import) alive.
	current.timer.unref?.();
}

async function tick(): Promise<void> {
	const current = state();
	if (current.stopping) return;
	if (current.running) {
		log("previous tick still running; skipping this minute");
		schedule();
		return;
	}

	current.running = true;
	const started = Date.now();
	try {
		await runJobsTickOnce();
	} finally {
		current.running = false;
		const duration = Date.now() - started;
		if (duration > 10_000) log("tick was slow", { ms: duration });
		schedule();
	}
}

/** Begin ticking. Safe to call more than once; only the first call starts. */
export function startScheduler(): void {
	if (!jobsEnabled()) return;
	const current = state();
	if (current.enabled) return;

	current.enabled = true;
	current.stopping = false;
	current.startedAt = new Date().toISOString();

	log("scheduler started", {
		mailBatch: MAIL_BATCH,
		backupDir: backupDirectory(),
	});
	schedule();

	if (!current.signalsRegistered) {
		current.signalsRegistered = true;
		const stop = (signal: string) => {
			if (current.stopping) return;
			current.stopping = true;
			if (current.timer) clearTimeout(current.timer);
			current.timer = null;
			log(`received ${signal}; waiting for the current tick`);
			const deadline = Date.now() + SHUTDOWN_GRACE_MS;
			const wait = () => {
				if (!current.running || Date.now() >= deadline) {
					process.exit(0);
					return;
				}
				setTimeout(wait, 200).unref?.();
			};
			wait();
		};
		process.once("SIGTERM", () => stop("SIGTERM"));
		process.once("SIGINT", () => stop("SIGINT"));
	}
}

/** Stop scheduling without exiting. Tests and shutdown paths only. */
export function stopScheduler(): void {
	const current = state();
	current.stopping = true;
	if (current.timer) clearTimeout(current.timer);
	current.timer = null;
	current.enabled = false;
}

export interface SchedulerStatus {
	enabled: boolean;
	running: boolean;
	startedAt: string;
	lastTickAt: string;
	lastError: string;
	lastBackupAt: string;
}

export function schedulerStatus(): SchedulerStatus {
	const current = globalForJobs.__ieeeJobs;
	return {
		enabled: current?.enabled ?? false,
		running: current?.running ?? false,
		startedAt: current?.startedAt ?? "",
		lastTickAt: current?.lastTickAt ?? "",
		lastError: current?.lastError ?? "",
		lastBackupAt: current?.lastBackupAt ?? "",
	};
}
