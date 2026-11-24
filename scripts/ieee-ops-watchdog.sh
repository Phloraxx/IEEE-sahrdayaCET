#!/usr/bin/env bash
#
# Production watchdog. Runs on the host, from cron, as the operator's user.
#
#   filesystem, container, backup-age and offsite-copy checks; exits 1 and
#   files (or comments on) the `[ops]` issue when something is wrong.
#
# Two of these checks were previously wrong in a way that could not pass:
#
#   * It required PocketBase's container health to be `healthy`, but PocketBase
#     0.39 has no `/api/health` route, so that container could never be healthy
#     and the watchdog reported it every run — a permanent alarm that buries the
#     real one. PocketBase is now retired from the default stack (a Compose
#     profile), so the check is opt-in and only asks whether the container runs.
#   * It treated "the newest local `*.zip` is recent" as "a verified offsite
#     copy exists". The zip is written before anything leaves the host. A
#     restic profile that was disabled, failing, or sealing archives without
#     uploading left the local file present and recent, and the watchdog stayed
#     quiet while the only offsite copy aged out. It now reads an upload marker
#     written after each verified remote PUT, and alerts on that age; a separate,
#     much longer-budget restore drill marker covers "would a restore work".
#     Sealing is not copying. See `src/server/jobs/offsite-marker.ts` and
#     docs/deployment.md § Offsite backups.
#
# Environment overrides (all optional):
#
#   IEEE_WATCHDOG_REPO          default Phloraxx/IEEE-sahrdayaCET
#   IEEE_WEB_CONTAINER          default ieee-rewrite-i9ir8q-web-1
#   IEEE_PB_CONTAINER           default empty: the rollback target is retired
#                                     (set it only while the legacy profile runs)
#   IEEE_BACKUP_EXPORT_DIR      default /home/drvij/ieee-backups/daily
#   IEEE_DISK_MAX_PERCENT       default 85
#   IEEE_BACKUP_MAX_AGE_SECONDS default 108000 (30 h)
#   IEEE_OFFSITE_MAX_AGE_SECONDS default 111600 (31 h)
#   IEEE_OFFSITE_DRILL_MAX_AGE_SECONDS default 7776000 (90 days)
#   IEEE_OFFSITE_REQUIRE_DRILL  default 0; 1 alerts when the drill is overdue
#   IEEE_BACKUP_GRACE_UNTIL_EPOCH  default 1788390000 (no backup checks before this)
#   IEEE_WATCHDOG_DRY_RUN       default 0; 1 prints the report and exits 1 on failure
#
# This script reads. It does not restart, prune, seal, restore or delete
# anything, and it never touches a database.
#
set -euo pipefail
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

REPO="${IEEE_WATCHDOG_REPO:-Phloraxx/IEEE-sahrdayaCET}"
WEB_CONTAINER="${IEEE_WEB_CONTAINER:-ieee-rewrite-i9ir8q-web-1}"
PB_CONTAINER="${IEEE_PB_CONTAINER-}"
EXPORT_DIR="${IEEE_BACKUP_EXPORT_DIR:-/home/drvij/ieee-backups/daily}"
DISK_MAX_PERCENT="${IEEE_DISK_MAX_PERCENT:-85}"
BACKUP_MAX_AGE_SECONDS="${IEEE_BACKUP_MAX_AGE_SECONDS:-108000}"
OFFSITE_MAX_AGE_SECONDS="${IEEE_OFFSITE_MAX_AGE_SECONDS:-111600}"
# A full read-back drill is a separate, long-cadence exercise (bandwidth and B2
# egress quota). Off by default: enable with IEEE_OFFSITE_REQUIRE_DRILL=1 once a
# drill job writes ieee-offsite-drill-*.json markers.
OFFSITE_DRILL_MAX_AGE_SECONDS="${IEEE_OFFSITE_DRILL_MAX_AGE_SECONDS:-7776000}"
OFFSITE_REQUIRE_DRILL="${IEEE_OFFSITE_REQUIRE_DRILL:-0}"
BACKUP_GRACE_UNTIL_EPOCH="${IEEE_BACKUP_GRACE_UNTIL_EPOCH:-1788390000}"
DRY_RUN="${IEEE_WATCHDOG_DRY_RUN:-0}"
TITLE="[ops] IEEE production watchdog alert"
failures=()

add_failure() { failures+=("$1"); }

usage() {
	sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'
}

case "${1:-}" in
	--help | -h) usage; exit 0 ;;
	"") ;;
	*) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
esac

# --- disk ------------------------------------------------------------------
usage_pct=$(df -P / | awk 'NR==2 {gsub("%", "", $5); print $5}')
if [[ ! "$usage_pct" =~ ^[0-9]+$ ]] || (( usage_pct >= DISK_MAX_PERCENT )); then
	add_failure "Disk usage is ${usage_pct:-unknown}% (threshold ${DISK_MAX_PERCENT}%)."
fi

# --- containers ------------------------------------------------------------
# The web service is the deployment: it must be running and must report itself
# ready. Its healthcheck is `/healthz`, which now reflects *minimum viable
# service* only (database answers, build identified). A stale backup or a paused
# job runner does not close the container, so those are alerted below from
# `/healthz`'s `checks`/`degraded` fields rather than through container health.
if ! docker inspect "$WEB_CONTAINER" >/dev/null 2>&1; then
	add_failure "Container ${WEB_CONTAINER} is missing."
else
	state=$(docker inspect -f '{{.State.Status}}' "$WEB_CONTAINER")
	health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$WEB_CONTAINER")
	oom=$(docker inspect -f '{{.State.OOMKilled}}' "$WEB_CONTAINER")
	restarts=$(docker inspect -f '{{.RestartCount}}' "$WEB_CONTAINER")
	if [[ "$state" != "running" || "$health" != "healthy" || "$oom" != "false" ]]; then
		add_failure "Container ${WEB_CONTAINER}: state=${state}, health=${health}, oom=${oom}, restarts=${restarts}."
	fi
	# A container that has restarted repeatedly is failing its own healthcheck
	# at a cadence the status alone hides between restarts.
	if [[ "$restarts" =~ ^[0-9]+$ ]] && (( restarts > 3 )); then
		add_failure "Container ${WEB_CONTAINER} has restarted ${restarts} times."
	fi
	# The image's baked commit, when it has one. Printed into the alert body so
	# the issue says which build was running, not just that one was.
	baked=$(docker exec "$WEB_CONTAINER" cat /app/build/git-commit 2>/dev/null || true)

	# Side jobs, read from inside the container so this works whether or not the
	# host can reach the public hostname. Readiness stays green for these; the
	# alert comes from here, independently.
	if [[ "$state" == "running" ]]; then
		side_health=$(docker exec "$WEB_CONTAINER" wget -qO- -T 5 http://127.0.0.1:3000/healthz 2>/dev/null || true)
		side_note=$(IEEE_HEALTH_BODY="$side_health" python3 - <<'PY' 2>&1 || true
import json, os
raw = os.environ.get("IEEE_HEALTH_BODY") or ""
try:
    body = json.loads(raw)
except Exception:
    print("")
    raise SystemExit(0)
checks = body.get("checks") or {}
for name in ("jobs", "backups"):
    status = checks.get(name)
    if status in (None, "ok"):
        continue
    label = "job runner" if name == "jobs" else "backup"
    print(f"{label} is {status} (site still serving; see /admin/data-health)")
PY
)
		if [[ -n "$side_note" ]]; then
			add_failure "Side job ${side_note}."
		fi
	fi
fi

# The PocketBase rollback target has no application runtime: no traffic
# reaches it and it has no meaningful healthcheck. "Running" is the whole
# contract. Set IEEE_PB_CONTAINER= (empty) to drop the check entirely.
# The PocketBase rollback target is retired: it is behind the
# `legacy-pocketbase` Compose profile and does not start with the stack. It is
# skipped by default. Set IEEE_PB_CONTAINER only while deliberately running
# `--profile legacy-pocketbase`, and then only "running" is asserted — it has no
# meaningful healthcheck.
if [[ -n "$PB_CONTAINER" ]]; then
	if ! docker inspect "$PB_CONTAINER" >/dev/null 2>&1; then
		add_failure "Legacy rollback container ${PB_CONTAINER} is missing, but IEEE_PB_CONTAINER asked for it to be checked."
	else
		pb_state=$(docker inspect -f '{{.State.Status}}' "$PB_CONTAINER")
		if [[ "$pb_state" != "running" ]]; then
			add_failure "Legacy rollback container ${PB_CONTAINER} is ${pb_state}, not running."
		fi
	fi
fi

# --- backups ---------------------------------------------------------------
now=$(date +%s)
if (( now >= BACKUP_GRACE_UNTIL_EPOCH )); then
	# The host export. Its presence and age say the *local* backup still runs;
	# it says nothing about whether a copy exists anywhere else.
	if [[ ! -d "$EXPORT_DIR" ]]; then
		add_failure "Backup export directory ${EXPORT_DIR} does not exist."
	else
		latest_export=$(find "$EXPORT_DIR" -maxdepth 1 -type f -name '*.zip' -printf '%T@\n' 2>/dev/null | sort -nr | head -1 || true)
		if [[ -z "$latest_export" ]]; then
			add_failure "No backup export exists in ${EXPORT_DIR}."
		else
			export_epoch=${latest_export%%.*}
			export_age=$((now - export_epoch))
			if (( export_age > BACKUP_MAX_AGE_SECONDS )); then
				add_failure "Local backup export is ${export_age}s old (max ${BACKUP_MAX_AGE_SECONDS}s)."
			fi
		fi
	fi

	# Two offsite questions, two budgets:
	#
	#   upload  Is the copy being kept current? Cheap metadata evidence written
	#           after each verified remote PUT. Checked here, daily.
	#   drill   Would a restore work? A full read-back that costs bandwidth and
	#           provider egress quota, so it runs on its own (long) cadence. A
	#           daily ~100 MB read would exhaust B2's free egress allowance.
	#
	# Neither treats the local zip as evidence; the zip exists before any copy.
	offsite_note=$(IEEE_MARKER_DIR="$EXPORT_DIR" \
		IEEE_OFFSITE_MAX_AGE_SECONDS="$OFFSITE_MAX_AGE_SECONDS" \
		IEEE_DRILL_MAX_AGE_SECONDS="$OFFSITE_DRILL_MAX_AGE_SECONDS" \
		IEEE_REQUIRE_DRILL="$OFFSITE_REQUIRE_DRILL" \
		IEEE_NOW="$now" \
		python3 - <<'PY' 2>&1 || true
import json, os, pathlib, re
from datetime import datetime

directory = pathlib.Path(os.environ["IEEE_MARKER_DIR"])
max_age = int(os.environ["IEEE_OFFSITE_MAX_AGE_SECONDS"])
drill_max_age = int(os.environ["IEEE_DRILL_MAX_AGE_SECONDS"])
require_drill = os.environ.get("IEEE_REQUIRE_DRILL", "0") == "1"
now = int(os.environ["IEEE_NOW"])


def load(prefix):
    files = sorted(p for p in directory.glob(prefix + "*.json")) if directory.is_dir() else []
    if prefix == "ieee-offsite-":
        files = [p for p in files if not p.name.startswith("ieee-offsite-drill-")]
    return files[-1] if files else None


def check(path, want_kind):
    if path is None:
        if want_kind == "drill":
            return "no offsite restore drill has ever been recorded"
        return "no upload marker exists; the newest local archive is NOT evidence of an offsite copy"
    try:
        m = json.loads(path.read_text())
    except Exception as exc:
        return f"{path.name} is unreadable: {exc}"
    problems = []
    if m.get("version") != 1:
        problems.append("version is not 1")
    if m.get("kind") != want_kind:
        problems.append(f"kind is not {want_kind}")
    if not re.fullmatch(r"[0-9a-f]{64}", str(m.get("archiveSha256") or "").lower()):
        problems.append("archiveSha256 is missing")
    target = str(m.get("target") or "")
    if not target or target.startswith("/") or target.startswith("~") or re.match(r"^[A-Za-z]:", target):
        problems.append("target is not offsite storage")
    if not (isinstance(m.get("bytes"), int) and m["bytes"] > 0):
        problems.append("bytes is missing")
    if m.get("proof") not in ("metadata", "read-back"):
        problems.append("proof is missing")
    if want_kind == "drill" and (m.get("proof") != "read-back" or m.get("restoreChecked") is not True):
        problems.append("a drill must be read back and restore-checked")
    if problems:
        return f"{path.name} is incomplete: " + "; ".join(problems)
    try:
        stamp = datetime.fromisoformat(str(m.get("verifiedAt") or "").replace("Z", "+00:00")).timestamp()
    except Exception:
        return f"{path.name} has an unreadable verifiedAt"
    age = now - int(stamp)
    limit = max_age if want_kind == "upload" else drill_max_age
    if age > limit:
        if want_kind == "upload":
            return f"offsite copy was last uploaded {age // 3600} h ago (max {limit // 3600} h)"
        return f"restore drill was {age // 86400} days ago (max {limit // 86400})"
    return ""


notes = []
upload_note = check(load("ieee-offsite-"), "upload")
if upload_note:
    notes.append("offsite upload: " + upload_note)
if require_drill:
    drill_note = check(load("ieee-offsite-drill-"), "drill")
    if drill_note:
        notes.append("offsite restore drill: " + drill_note)
if notes:
    print("; ".join(notes))
PY
	)
	if [[ -n "$offsite_note" ]]; then
		add_failure "Offsite backup: ${offsite_note}."
	fi
fi

# --- alerts ----------------------------------------------------------------
if ! command -v gh >/dev/null 2>&1; then
	add_failure "GitHub CLI is unavailable, so alerts cannot be delivered."
fi

issue_number=""
if command -v gh >/dev/null 2>&1; then
	issue_number=$(gh issue list --repo "$REPO" --state open --search 'IEEE production watchdog alert in:title' \
		--json number,title --jq '.[] | select(.title=="[ops] IEEE production watchdog alert") | .number' 2>/dev/null | head -1 || true)
fi

timestamp=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
if (( ${#failures[@]} > 0 )); then
	body="Production watchdog found ${#failures[@]} problem(s) at ${timestamp}:"
	for failure in "${failures[@]}"; do body+=$'\n- '"$failure"; done
	if [[ -n "${baked:-}" ]]; then
		body+=$'\n- (context) running web image was built from commit '"${baked}"
	fi
	if [[ "$DRY_RUN" == "1" ]]; then
		printf '%s\n' "$body"
		exit 1
	fi
	if [[ -n "$issue_number" ]]; then
		gh issue comment "$issue_number" --repo "$REPO" --body "$body" >/dev/null
	else
		gh issue create --repo "$REPO" --title "$TITLE" --body "$body" >/dev/null
	fi
	logger -t ieee-ops-watchdog "$body"
	exit 1
fi

if [[ "$DRY_RUN" == "1" ]]; then
	echo "Production watchdog checks passed at ${timestamp}."
	exit 0
fi

if [[ -n "$issue_number" ]]; then
	gh issue comment "$issue_number" --repo "$REPO" --body "Production watchdog recovered at ${timestamp}; all checks are healthy." >/dev/null
	gh issue close "$issue_number" --repo "$REPO" >/dev/null
fi
logger -t ieee-ops-watchdog "all production watchdog checks passed"
echo "Production watchdog checks passed at ${timestamp}."
