#!/usr/bin/env bash
set -euo pipefail
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

REPO="${IEEE_WATCHDOG_REPO:-Phloraxx/IEEE-sahrdayaCET}"
PB_CONTAINER="${IEEE_PB_CONTAINER:-ieee-rewrite-i9ir8q-pocketbase-1}"
WEB_CONTAINER="${IEEE_WEB_CONTAINER:-ieee-rewrite-i9ir8q-web-1}"
PB_VOLUME="${IEEE_PB_VOLUME:-ieee-rewrite-i9ir8q_pb_data}"
EXPORT_DIR="${IEEE_BACKUP_EXPORT_DIR:-/home/drvij/ieee-backups/daily}"
DISK_MAX_PERCENT="${IEEE_DISK_MAX_PERCENT:-85}"
BACKUP_MAX_AGE_SECONDS="${IEEE_BACKUP_MAX_AGE_SECONDS:-108000}"
EXPORT_MAX_AGE_SECONDS="${IEEE_EXPORT_MAX_AGE_SECONDS:-111600}"
BACKUP_GRACE_UNTIL_EPOCH="${IEEE_BACKUP_GRACE_UNTIL_EPOCH:-1788390000}"
DRY_RUN="${IEEE_WATCHDOG_DRY_RUN:-0}"
TITLE="[ops] IEEE production watchdog alert"
failures=()

add_failure() { failures+=("$1"); }

usage=$(df -P / | awk 'NR==2 {gsub("%", "", $5); print $5}')
if [[ ! "$usage" =~ ^[0-9]+$ ]] || (( usage >= DISK_MAX_PERCENT )); then
  add_failure "Disk usage is ${usage:-unknown}% (threshold ${DISK_MAX_PERCENT}%)."
fi

for container in "$PB_CONTAINER" "$WEB_CONTAINER"; do
  if ! docker inspect "$container" >/dev/null 2>&1; then
    add_failure "Container ${container} is missing."
    continue
  fi
  state=$(docker inspect -f '{{.State.Status}}' "$container")
  health=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container")
  oom=$(docker inspect -f '{{.State.OOMKilled}}' "$container")
  if [[ "$state" != "running" || "$health" != "healthy" || "$oom" != "false" ]]; then
    add_failure "Container ${container}: state=${state}, health=${health}, oom=${oom}."
  fi
done

now=$(date +%s)
if (( now >= BACKUP_GRACE_UNTIL_EPOCH )); then
  native_age=$(docker run --rm -i -v "$PB_VOLUME:/data:ro" python:3.12-alpine python - <<'PY'
import pathlib, time
files=sorted(pathlib.Path('/data/backups').glob('*.zip'), key=lambda p:p.stat().st_mtime, reverse=True)
print('missing' if not files else max(0, int(time.time()-files[0].stat().st_mtime)))
PY
  )
  if [[ ! "$native_age" =~ ^[0-9]+$ ]] || (( native_age > BACKUP_MAX_AGE_SECONDS )); then
    add_failure "Native PocketBase backup age=${native_age}s (max ${BACKUP_MAX_AGE_SECONDS}s)."
  fi

  latest_export=$(find "$EXPORT_DIR" -maxdepth 1 -type f -name '*.zip' -printf '%T@\n' 2>/dev/null | sort -nr | head -1 || true)
  if [[ -z "$latest_export" ]]; then
    add_failure "No verified host backup export exists."
  else
    export_epoch=${latest_export%%.*}
    export_age=$((now - export_epoch))
    if (( export_age > EXPORT_MAX_AGE_SECONDS )); then
      add_failure "Verified backup export age=${export_age}s (max ${EXPORT_MAX_AGE_SECONDS}s)."
    fi
  fi
fi

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
