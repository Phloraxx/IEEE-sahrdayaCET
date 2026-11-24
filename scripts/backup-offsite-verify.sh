#!/usr/bin/env bash
#
# Record offsite-copy evidence for the watchdog.
#
# Two independent modes, on purpose (see src/server/jobs/offsite-marker.ts):
#
#   --mode upload   cheap, runs with every backup. Confirms the object is at
#                   --target with the archive's size (and its sha256 when the
#                   store reports one), from the PUT/`restic` output or a
#                   metadata (HEAD/stat) check. The watchdog's daily freshness
#                   check reads this.
#
#   --mode drill    expensive, runs periodically, not daily. Confirms a copy can
#                   be restored: downloads the object, checks its sha256, and
#                   (with --restore-checked) records that a restore succeeded.
#
#   scripts/backup-offsite-verify.sh --mode upload \
#     --archive /home/drvij/ieee-backups/daily/ieee-sqlite-2026-11-24T024000Z.zip \
#     --target restic:b2:ieee-offsite --remote-sha256 <sha> --restic-snapshot <id>
#
#   scripts/backup-offsite-verify.sh --mode drill \
#     --archive <local archive> --target restic:b2:ieee-offsite \
#     --read-back <copy fetched back> --restore-checked
#
# --target is the offsite store, never a local path (that is the mistake the
# marker exists to catch). --remote-sha256 lets the store's own checksum stand in
# for a download; with restic its SHA-256 is the content hash, so a `restic
# check --read-data-subset` or the snapshot id is authoritative.
#
# The 150 MB daily read-back is deliberately NOT the default: Backblaze B2 free
# egress is capped, and a daily full read would trip it. The drill runs on its
# own cadence and its own age budget.
#
# Exit 0 writes ieee-offsite-<stamp>.json (upload) or
# ieee-offsite-drill-<stamp>.json (drill). Exit 1 writes nothing and says why.
# It never deletes, seals, uploads or restores anything.
#
set -euo pipefail

MODE="upload"
ARCHIVE=""
TARGET=""
READ_BACK=""
RESTORE_CHECKED=0
MARKER_DIR=""
REMOTE_SHA=""
RESTIC_SNAPSHOT=""

die() { printf 'backup-offsite-verify: %s\n' "$*" >&2; exit 1; }

usage() {
	sed -n '2,42p' "$0" | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
	case "$1" in
		--mode) MODE="${2:-}"; shift 2 ;;
		--archive) ARCHIVE="${2:-}"; shift 2 ;;
		--target) TARGET="${2:-}"; shift 2 ;;
		--read-back) READ_BACK="${2:-}"; shift 2 ;;
		--remote-sha256) REMOTE_SHA="${2:-}"; shift 2 ;;
		--restic-snapshot) RESTIC_SNAPSHOT="${2:-}"; shift 2 ;;
		--marker-dir) MARKER_DIR="${2:-}"; shift 2 ;;
		--restore-checked) RESTORE_CHECKED=1; shift ;;
		--help | -h) usage; exit 0 ;;
		*) die "unknown option: $1" ;;
	esac
done

[[ "$MODE" == "upload" || "$MODE" == "drill" ]] || die "--mode must be upload or drill"
[[ -n "$ARCHIVE" ]] || { usage >&2; die "--archive is required"; }
[[ -f "$ARCHIVE" ]] || die "archive not found: $ARCHIVE"
[[ -n "$TARGET" ]] || die "--target is required (where the copy lives)"
if [[ "$TARGET" == /* || "$TARGET" == ~* || "$TARGET" =~ ^[A-Za-z]: ]]; then
	die "--target looks like a local path ('$TARGET'); the marker is for offsite storage"
fi
command -v sha256sum >/dev/null 2>&1 || die "sha256sum is required"
command -v python3 >/dev/null 2>&1 || die "python3 is required"

MARKER_DIR="${MARKER_DIR:-$(dirname "$ARCHIVE")}"
mkdir -p "$MARKER_DIR"

sha_local=$(sha256sum "$ARCHIVE" | cut -d' ' -f1)
bytes=$(stat -c %s "$ARCHIVE")

proof="metadata"
restore_checked=false

if [[ "$MODE" == "drill" ]]; then
	[[ -n "$READ_BACK" ]] || die "a drill requires --read-back <a copy fetched back from --target>"
	[[ -f "$READ_BACK" ]] || die "read-back copy not found: $READ_BACK"
	sha_remote=$(sha256sum "$READ_BACK" | cut -d' ' -f1)
	[[ "$sha_remote" == "$sha_local" ]] \
		|| die "read-back copy does not match the archive (local $sha_local, read back $sha_remote)"
	[[ "$RESTORE_CHECKED" -eq 1 ]] \
		|| die "the copy was read back but not restore-checked; run the restore and pass --restore-checked"
	proof="read-back"
	restore_checked=true
	REMOTE_SHA="$sha_local"
else
	# upload: the store must report a matching checksum when it reports one.
	if [[ -n "$REMOTE_SHA" ]]; then
		[[ "${REMOTE_SHA,,}" == "$sha_local" ]] \
			|| die "the store's checksum ($REMOTE_SHA) does not match the archive ($sha_local)"
	fi
fi

stamp=$(date -u +'%Y-%m-%dT%H%M%SZ')
prefix="ieee-offsite-"
[[ "$MODE" == "drill" ]] && prefix="ieee-offsite-drill-"
marker="$MARKER_DIR/${prefix}${stamp}.json"

python3 - "$marker" "$ARCHIVE" "$TARGET" "$sha_local" "$bytes" "$MODE" "$proof" \
	"$restore_checked" "$REMOTE_SHA" "$RESTIC_SNAPSHOT" <<'PY'
import json, sys, time
(path, archive, target, sha, size, kind, proof, restore_checked, remote_sha, snapshot) = sys.argv[1:11]
payload = {
    "version": 1,
    "kind": kind,
    "verifiedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "archiveSha256": sha,
    "archiveName": archive.rsplit("/", 1)[-1],
    "target": target,
    "bytes": int(size),
    "proof": proof,
    "files": 1,
}
if remote_sha:
    payload["remoteSha256"] = remote_sha.lower()
if kind == "drill":
    payload["restoreChecked"] = restore_checked == "true"
if snapshot:
    payload["resticSnapshot"] = snapshot
with open(path, "x", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2)
    handle.write("\n")
print(path)
PY

if [[ "$MODE" == "drill" ]]; then
	printf 'restore drill recorded: %s -> %s\n' "$(basename "$ARCHIVE")" "$TARGET"
else
	printf 'offsite upload recorded: %s -> %s (%s)\n' "$(basename "$ARCHIVE")" "$TARGET" "$proof"
fi
