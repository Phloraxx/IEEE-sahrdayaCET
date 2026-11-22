/**
 * Scheduling arithmetic for the in-process job runner.
 *
 * The runner is deliberately dumb: it wakes on each wall-clock minute and asks
 * "is anything due?". That makes a missed window (a restart, a slow tick) a
 * delay rather than a skipped run, and it keeps the next-run state derivable
 * from the last run instead of from a timer that only exists in memory.
 */

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;
export const WEEK_MS = 7 * DAY_MS;

/**
 * Milliseconds until the next wall-clock minute boundary.
 *
 * A fixed `setInterval(60_000)` drifts by the tick duration and drifts further
 * on every slow run; aligning to the boundary does not. The extra few
 * milliseconds keep the tick safely past the boundary so a clock that fires
 * marginally early does not schedule a second wake in the same minute.
 */
export function msUntilNextMinute(nowMs: number): number {
	const remainder = nowMs % MINUTE_MS;
	return remainder === 0 ? MINUTE_MS : MINUTE_MS - remainder + 5;
}

/** Has `intervalMs` elapsed since `lastMs`? `0` means "never". */
export function isDue(lastMs: number, nowMs: number, intervalMs: number): boolean {
	if (!Number.isFinite(lastMs) || lastMs <= 0) return true;
	return nowMs - lastMs >= intervalMs;
}

/** `2026-11-22T02:20:00.000Z` -> `2026-11-22T02-20-00-000Z` (filename-safe). */
export function timestampForFilename(nowMs: number): string {
	return new Date(nowMs).toISOString().replace(/[:.]/g, "-");
}
