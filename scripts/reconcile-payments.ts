/**
 * Payment-expiry reconciliation pass.
 *
 * Run this once a minute (systemd timer or cron):
 *
 *   SQLITE_PATH=/data/portal.db npx tsx scripts/reconcile-payments.ts
 *
 * It exists as a separate process on purpose. The web app must not own a cron
 * loop: a deploy would restart the timer, and a hung provider call would tie up
 * a request worker. A timer that exits is easier to observe and retry.
 *
 * Exit code 0 means the pass completed, whatever it released. A non-zero exit
 * means the pass itself failed and the timer should alert.
 */

import { closeDatabase } from "../src/lib/db.server";
import { reconcileExpiredRegistrations } from "../src/server/payments/reconcile";

async function main() {
	const result = await reconcileExpiredRegistrations();
	console.log(
		JSON.stringify({
			at: new Date().toISOString(),
			scanned: result.scanned,
			released: result.released,
			keptForProvider: result.keptForProvider,
			skipped: result.skipped,
			releasedIds: result.releasedIds,
		}),
	);
}

main()
	.catch((error) => {
		console.error("[reconcile-payments] pass failed:", error);
		process.exitCode = 1;
	})
	.finally(() => {
		closeDatabase();
	});
