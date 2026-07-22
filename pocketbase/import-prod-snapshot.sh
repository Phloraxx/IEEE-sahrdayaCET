#!/bin/sh
set -eu

SOURCE="/legacy-prod/data"
TARGET="/pb/pb_data"
MARKER="$TARGET/.staging-prod-import-v1"
SAFETY="$TARGET/.migration-safety"

serve() {
  exec ./pocketbase serve --http=0.0.0.0:8090 --encryptionEnv=PB_ENCRYPTION_KEY
}

if [ "${STAGING_IMPORT_FROM_PROD:-}" != "1" ] || [ -f "$MARKER" ]; then
  serve
fi

echo "[staging-import] preparing read-only snapshot from existing IEEE PocketBase"
test -f "$SOURCE/data.db"
test -d "$SOURCE/storage"
mkdir -p "$TARGET" "$TARGET/storage" "$SAFETY"

# Preserve the fresh staging state once so the rehearsal is trivially reversible.
if [ ! -f "$SAFETY/before-import.tar.gz" ]; then
  tar -czf "$SAFETY/before-import.tar.gz" \
    --exclude='./.migration-safety' \
    -C "$TARGET" .
fi

# First pass ensures files referenced by the upcoming DB snapshot are already present.
cp -a "$SOURCE/storage/." "$TARGET/storage/"

rm -f "$TARGET/data.db.import" "$TARGET/auxiliary.db.import"
sqlite3 "$SOURCE/data.db" ".backup '$TARGET/data.db.import'"
if [ -f "$SOURCE/auxiliary.db" ]; then
  sqlite3 "$SOURCE/auxiliary.db" ".backup '$TARGET/auxiliary.db.import'"
fi

# Second pass catches files uploaded while the online SQLite snapshot was taken.
# We intentionally never delete copied files, avoiding a race with concurrent deletes.
cp -a "$SOURCE/storage/." "$TARGET/storage/"

integrity="$(sqlite3 "$TARGET/data.db.import" 'PRAGMA integrity_check;')"
[ "$integrity" = "ok" ] || { echo "[staging-import] DB integrity check failed: $integrity" >&2; exit 1; }

for table in users societies events registrations coupons execom blogs fifa_matches fifa_bets; do
  src="$(sqlite3 "$SOURCE/data.db" "SELECT count(*) FROM $table;")"
  dst="$(sqlite3 "$TARGET/data.db.import" "SELECT count(*) FROM $table;")"
  echo "[staging-import] $table source=$src snapshot=$dst"
  [ "$src" = "$dst" ] || { echo "[staging-import] count mismatch for $table" >&2; exit 1; }
done

source_files="$(find "$SOURCE/storage" -type f | wc -l | tr -d ' ')"
target_files="$(find "$TARGET/storage" -type f | wc -l | tr -d ' ')"
echo "[staging-import] storage source=$source_files target=$target_files"
[ "$target_files" -ge "$source_files" ] || { echo "[staging-import] storage copy incomplete" >&2; exit 1; }

# PocketBase is not running in this container yet, so swapping the staging DB is safe.
rm -f "$TARGET/data.db" "$TARGET/data.db-wal" "$TARGET/data.db-shm"
mv "$TARGET/data.db.import" "$TARGET/data.db"
if [ -f "$TARGET/auxiliary.db.import" ]; then
  rm -f "$TARGET/auxiliary.db" "$TARGET/auxiliary.db-wal" "$TARGET/auxiliary.db-shm"
  mv "$TARGET/auxiliary.db.import" "$TARGET/auxiliary.db"
fi

echo "[staging-import] snapshot installed; starting PocketBase so committed migrations can run"
./pocketbase serve --http=0.0.0.0:8090 --encryptionEnv=PB_ENCRYPTION_KEY &
pb_pid=$!
trap 'kill -TERM "$pb_pid" 2>/dev/null || true; wait "$pb_pid" 2>/dev/null || true; exit 0' TERM INT

# PocketBase applies unapplied migrations before becoming healthy. Mark the import only
# after the migrated server is actually serving, so a failed migration retries from a
# fresh production snapshot instead of leaving staging half-migrated.
for _ in $(seq 1 120); do
  if curl -fsS http://127.0.0.1:8090/api/health >/dev/null 2>&1; then
    touch "$MARKER"
    echo "[staging-import] migrated PocketBase is healthy; import marked complete"
    wait "$pb_pid"
    exit $?
  fi
  if ! kill -0 "$pb_pid" 2>/dev/null; then
    wait "$pb_pid"
    exit $?
  fi
  sleep 1
done

echo "[staging-import] PocketBase did not become healthy after migration" >&2
kill -TERM "$pb_pid" 2>/dev/null || true
wait "$pb_pid" 2>/dev/null || true
exit 1
