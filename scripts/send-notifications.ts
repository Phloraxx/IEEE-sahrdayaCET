/**
 * Notification outbox pass.
 *
 * Run this once a minute (systemd timer or cron):
 *
 *   SQLITE_PATH=/data/portal.db npx tsx scripts/send-notifications.ts
 *
 * Same reasoning as the payment reconciler: the web app must not own a timer.
 * The pass exits, prints one JSON line per run, and leaves every decision in the
 * outbox row where the admin panel can show it.
 *
 * Exit code 0 means the pass completed, whatever it sent. A non-zero exit means
 * the pass itself failed and the timer should alert.
 */

import { closeDatabase } from "../src/lib/db.server";
import { runOutboxPass } from "../src/server/mail/worker";

async function main() {
	const result = await runOutboxPass({ limit: 25 });
	console.log(
		JSON.stringify({
			at: result.at,
			scanned: result.scanned,
			sent: result.sent,
			failed: result.failed,
			blocked: result.blocked,
			skipped: result.skipped,
			sentToday: result.sentToday,
			dailyLimit: result.dailyLimit,
			capped: result.capped,
			errors: result.errors.slice(0, 5),
		}),
	);
}

main()
	.catch((error) => {
		console.error("[send-notifications] pass failed:", error);
		process.exitCode = 1;
	})
	.finally(() => {
		closeDatabase();
	});
