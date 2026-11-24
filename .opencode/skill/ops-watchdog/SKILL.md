---
name: ops watchdog
description: Read, silence correctly, and fix an IEEE production watchdog alert (the [ops] GitHub issue): disk, container, local backup, offsite upload, or restore drill. Use when the watchdog opens or updates its issue, or before changing the watchdog itself.
---

# Ops watchdog

`scripts/ieee-ops-watchdog.sh` runs on the production host from cron, as the
operator's user. It reads state and files (or comments on) one GitHub issue
titled `[ops] IEEE production watchdog alert`. It never restarts, prunes, seals,
restores or deletes anything, and it never touches a database.

Exit `1` means at least one check failed; exit `0` means the issue, if open, was
commented and closed as recovered.

## Run it by hand

```bash
IEEE_WATCHDOG_DRY_RUN=1 scripts/ieee-ops-watchdog.sh
```

Dry-run prints the alert body and exits without touching GitHub. Use it whenever
you change the script, a threshold, or a backup job.

## What each alert means, and what to check

| Alert | Meaning | Check |
| --- | --- | --- |
| `Disk usage is N%` | root filesystem past `IEEE_DISK_MAX_PERCENT` (85) | `df -h /`, `docker system df`, backup export and `BACKUP_DIR` growth |
| `Container …-web-1: state=…, health=…` | the deployment cannot serve | `docker inspect`, then `/healthz` for the failing **readiness** check (`database`) |
| `Container …-web-1 has restarted N times` | crash loop, often OOM or a bad deploy | `docker logs <id> --tail 200`, look for `[boot]` and `[jobs]` lines |
| `Legacy rollback container …` | only when `IEEE_PB_CONTAINER` is set | the rollback target is retired; clear the variable unless you deliberately ran `--profile legacy-pocketbase` |
| `Side job job runner is fail…` | the in-process runner has not ticked | the site is still serving. Check `docker logs` for the last `[jobs]` line; a stalled runner is a real problem but not an outage |
| `Side job backup is fail…` | the newest archive is past its cadence | run `scripts/ieee-backup-export.sh` by hand and read its error |
| `Local backup export is Ns old` | the hourly/daily export stopped writing | same as above |
| `Offsite upload: no upload marker exists…` | nothing proves the archive left the host | see below |
| `Offsite upload: … was last uploaded N h ago` | the copy job is failing or disabled | run it by hand, then the verifier |
| `Offsite upload: … predates the newest local archive` | the copy job is behind | run it once; this is not an error to suppress |
| `Offsite restore drill: … days ago` | only with `IEEE_OFFSITE_REQUIRE_DRILL=1` | run a drill, do not raise the budget |
| `GitHub CLI is unavailable` | alerts cannot be delivered at all | install/sign in `gh` for the cron user |

`/healthz` returns 503 only when the database cannot answer. A stale backup or a
paused runner appears in its `checks`/`degraded` fields and as a **side job**
alert here. Read the reasons on the admin **Data health** page before restarting
anything.

## Two offsite questions, two cadences

A recent `*.zip` in the export directory means the local export ran. It is not an
offsite copy, and a copy job that seals or rotates archives without uploading
produces nothing the watchdog accepts.

| Evidence | Written by | Budget |
| --- | --- | --- |
| `ieee-offsite-<stamp>.json` (`kind: upload`) | `scripts/backup-offsite-verify.sh --mode upload` after a verified remote PUT or metadata check | 31 h (`IEEE_OFFSITE_MAX_AGE_SECONDS`) |
| `ieee-offsite-drill-<stamp>.json` (`kind: drill`) | `--mode drill … --read-back … --restore-checked` after a full read-back restore | 90 days, only with `IEEE_OFFSITE_REQUIRE_DRILL=1` |

The upload check is deliberately cheap. A daily read-back of the ~98 MB archive
would push that much through B2 every day, past its free egress allowance, so it
is a separate exercise on a slower cadence. A fresh drill cannot mask a stale
upload, and a healthy upload does not satisfy the drill budget.

Either way, if the store cannot be read back or checksummed, the marker is still
written without that evidence and the watchdog keeps alerting. That is correct: a
copy nobody can restore is not a backup. Do not raise a budget to clear an alert.

## Silence a real alert correctly

- Fixing the cause closes the issue on the next clean run.
- A check that no longer applies is removed by its environment variable (for
  example `IEEE_PB_CONTAINER` after retiring the legacy target), not by editing a
  threshold.
- Do not lower thresholds to make a run pass; that converts a real alert into a
  permanent blind spot.

## Before changing the script

1. `bash -n scripts/ieee-ops-watchdog.sh`.
2. Run it with `IEEE_WATCHDOG_DRY_RUN=1` against a fixture directory
   (`IEEE_BACKUP_EXPORT_DIR=/tmp/... IEEE_BACKUP_GRACE_UNTIL_EPOCH=0`).
3. The marker verdicts are pinned by
   `tests/unit/server/ops-offsite-marker.test.ts`; change the logic there first.
