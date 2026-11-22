/**
 * Take one backup now.
 *
 * The in-app runner does this daily; this exists for an operator who needs one
 * before a migration, and for a restore rehearsal (take a real archive, restore
 * it, compare). Same code path as the scheduler, not a copy of it.
 *
 *   SQLITE_PATH=… UPLOADS_DIR=… BACKUP_DIR=… npx tsx scripts/backup-now.ts
 */

import { runBackup } from "../src/server/jobs/backup";

async function main() {
	const started = Date.now();
	const result = await runBackup();
	console.log(
		JSON.stringify(
			{
				at: new Date().toISOString(),
				ms: Date.now() - started,
				...result,
			},
			null,
			2,
		),
	);
}

main().catch((error) => {
	console.error("[backup-now] failed:", error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
