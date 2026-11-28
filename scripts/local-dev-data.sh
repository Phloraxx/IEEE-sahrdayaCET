#!/usr/bin/env bash
# Create the local data directory with the ownership the container runs as.
#
# The web image runs as uid 1000. A bind mount keeps the host directory's
# ownership, so a `docker-compose.local.yml` directory the Compose daemon
# created as root makes SQLite fail with "unable to open database file" — the
# page still answers 200, so the failure is easy to miss.
#
#   scripts/local-dev-data.sh          # create data/local owned by the caller
#   LOCAL_UID=1000 LOCAL_GID=1000 scripts/local-dev-data.sh
#
# Safe to re-run: it chowns the directory when the caller may, and otherwise
# tells you the one command to run.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIR="${LOCAL_DATA_DIR:-$ROOT/data/local}"
UID_TARGET="${LOCAL_UID:-1000}"
GID_TARGET="${LOCAL_GID:-1000}"

mkdir -p "$DIR"
if [ "$(stat -c '%u:%g' "$DIR")" = "$UID_TARGET:$GID_TARGET" ]; then
	echo "$DIR is already $UID_TARGET:$GID_TARGET"
	exit 0
fi
if chown "$UID_TARGET:$GID_TARGET" "$DIR" 2>/dev/null; then
	echo "$DIR is now $UID_TARGET:$GID_TARGET"
	exit 0
fi

# Not ours to chown. The compose file already runs the container as the
# directory's owner by default, so the usual local case still works; anything
# else (a directory owned by root) needs one privileged command.
if [ "$(stat -c '%u' "$DIR")" -ne 0 ]; then
	echo "$DIR is owned by $(stat -c '%u:%g' "$DIR"); the container will run as that owner."
	echo "Re-run with sudo to give it $UID_TARGET:$GID_TARGET, or set LOCAL_UID/LOCAL_GID."
	exit 0
fi

echo "$DIR is owned by root, which the container cannot write." >&2
echo "Run once as root: chown -R $UID_TARGET:$GID_TARGET \"$DIR\"" >&2
exit 1
