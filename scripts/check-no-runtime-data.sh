#!/usr/bin/env bash
# Fail when the Git index holds runtime application data.
#
# The database, its backups and their SQLite sidecars are runtime state, never
# source: a committed `portal.db` would put real member records in the public
# repository and bake a stale database into the image. `.gitignore` and
# `.dockerignore` keep new files out; this is the check for `git add -f`.
#
# Names only: `git ls-files` is read NUL-terminated and never opened, printed by
# content, hashed or resolved, and no history is read — a shallow checkout gives
# the same verdict. The local server's default store is `./data/portal.db`.
#
# Exit: 0 clean, 1 runtime data is tracked, non-zero from git when it cannot list.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# Must agree with the *.db/*.sqlite/*.db3/*.sl3 rules in .gitignore and
# .dockerignore, except that `sqlite/schema.sql` (the schema source of truth),
# tests/ seeds and public/ assets are matched by neither. The store directories
# are root-anchored so `src/lib/data/` (browser clients) is never a candidate.
runtime='\.(db|db3|sl3|sqlite|sqlite3)(-wal|-shm|-journal)?$|\.(dump|dump\.sql|bak|backup)$|^((apps|packages)/[^/]+/)?(data|backups?|restores?|dumps?)/'

# One whole NUL-delimited record per name, so a name containing a newline is
# still one name. The pattern is pinned in a variable because bash 3.2 (the
# macOS default) expands backslashes in an unquoted `=~` operand.
re=$runtime
offenders=0

git ls-files -z | (
	shopt -s nocasematch
	while IFS= read -r -d '' path; do
		[[ $path =~ $re ]] || continue
		# %q keeps control characters and quotes on one diagnostic line.
		printf -v shown '%q' "$path"
		echo "tracked runtime data: $shown" >&2
		offenders=$((offenders + 1))
	done
	[ "$offenders" -eq 0 ] || {
		echo "check-no-runtime-data: $offenders path(s) above are runtime state; remove them from the index with 'git rm --cached -- <path>'." >&2
		exit 1
	}
)
