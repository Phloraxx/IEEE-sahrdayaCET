#!/usr/bin/env bash
#
# Back up the IEEE Sahrdaya application database and uploads volume.
#
#   ieee-backup-export.sh                      # take a backup
#   ieee-backup-export.sh backup               # same
#   ieee-backup-export.sh restore <zip> <dir>  # materialise and verify one
#
# The app server owns its data now: one SQLite file plus an uploads directory,
# both bind-mounted from the host. This script replaces the PocketBase-era
# version, which copied PocketBase's own backup archives out of a Docker volume.
#
# Why VACUUM INTO and not `cp`
# ----------------------------
# The database runs in WAL mode with a live writer, so the file on disk is not a
# consistent snapshot: recent commits may still be in `-wal`, and a plain copy
# can capture a torn page mid-checkpoint. `VACUUM INTO` opens a read transaction
# and writes a fully materialised, defragmented database to a new file. It holds
# no write lock, so the running app keeps serving throughout.
#
# Ordering, and what it costs
# ---------------------------
# The database is snapshotted first, then the uploads tree. A file uploaded
# between the two is an orphan in the archive — harmless, and the data-health
# page already reports orphans. The reverse order would be worse: a file deleted
# between the two would be referenced by the database but missing from the
# archive. So the window is biased towards the safe direction.
#
# Output
# ------
# One zip per run in $IEEE_BACKUP_DIR, named `ieee-sqlite-<UTC stamp>.zip`,
# containing:
#
#   portal.db        consistent database snapshot
#   uploads/...      the uploads tree, same layout as the live volume
#   manifest.json    sha256 of portal.db, table count, uploads file count
#
# plus a `<zip>.sha256` sidecar. The zip is the unit of retention and of
# offsite copy; `scripts/ieee-ops-watchdog.sh` checks the newest `*.zip` in
# this directory, so the extension is part of the contract.
#
# Environment
# -----------
#   IEEE_SQLITE_DB        required. Path to the live portal.db.
#   IEEE_UPLOADS_DIR      required. Path to the uploads directory.
#   IEEE_BACKUP_DIR       default /home/drvij/ieee-backups/daily
#   IEEE_BACKUP_MAX_KEEP  default 30 archives
#   IEEE_BACKUP_LOCK      default /tmp/ieee-backup-export.lock
#
set -euo pipefail
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

MODE="${1:-backup}"

SQLITE_DB="${IEEE_SQLITE_DB:-}"
UPLOADS_DIR="${IEEE_UPLOADS_DIR:-}"
DEST="${IEEE_BACKUP_DIR:-/home/drvij/ieee-backups/daily}"
MAX_KEEP="${IEEE_BACKUP_MAX_KEEP:-30}"
LOCK="${IEEE_BACKUP_LOCK:-/tmp/ieee-backup-export.lock}"

# A schema with fewer tables than this means we are pointed at the wrong file,
# or at a database that never finished initialising. Matches the sanity check in
# the host-level staging snapshot script.
MIN_TABLES=20

die() { printf 'ieee-backup-export: %s\n' "$*" >&2; exit 1; }

require_backup_env() {
	[[ -n "$SQLITE_DB" ]] || die "IEEE_SQLITE_DB is not set (path to the live portal.db)"
	[[ -f "$SQLITE_DB" ]] || die "IEEE_SQLITE_DB does not exist: $SQLITE_DB"
	[[ -n "$UPLOADS_DIR" ]] || die "IEEE_UPLOADS_DIR is not set (path to the uploads directory)"
	[[ -d "$UPLOADS_DIR" ]] || die "IEEE_UPLOADS_DIR does not exist: $UPLOADS_DIR"
	command -v python3 >/dev/null 2>&1 || die "python3 is required"
	python3 -c 'import sqlite3, zipfile, hashlib' >/dev/null 2>&1 \
		|| die "python3 is missing the sqlite3/zipfile/hashlib modules"
}

# ---------------------------------------------------------------------------
# backup
# ---------------------------------------------------------------------------

do_backup() {
	require_backup_env
	mkdir -p "$DEST"

	exec 9>"$LOCK"
	flock -n 9 || { echo "another backup is already running"; exit 0; }

	python3 - "$SQLITE_DB" "$UPLOADS_DIR" "$DEST" "$MAX_KEEP" "$MIN_TABLES" <<'PYEOF'
import hashlib, json, os, pathlib, shutil, sqlite3, sys, tempfile, time, zipfile

src_db, uploads_dir, dest_dir = sys.argv[1], sys.argv[2], pathlib.Path(sys.argv[3])
max_keep, min_tables = int(sys.argv[4]), int(sys.argv[5])

stamp = time.strftime("%Y-%m-%dT%H%M%SZ", time.gmtime())
archive = dest_dir / f"ieee-sqlite-{stamp}.zip"
partial = dest_dir / f".{archive.name}.partial"

work = pathlib.Path(tempfile.mkdtemp(prefix="ieee-backup-"))
try:
    snapshot = work / "portal.db"

    # Read-only connection: VACUUM INTO needs a read transaction, not a write.
    try:
        con = sqlite3.connect(f"file:{src_db}?mode=ro", uri=True)
        try:
            con.execute("VACUUM INTO ?", (str(snapshot),))
        finally:
            con.close()
    except sqlite3.DatabaseError as exc:
        # The usual cause is IEEE_SQLITE_DB pointing at something that is not a
        # SQLite file. A traceback here would be noise in a cron log.
        raise SystemExit(f"cannot read {src_db} as a SQLite database: {exc}")

    # Verify the snapshot, not the source. A corrupt copy that verifies cleanly
    # is the only kind worth keeping.
    chk = sqlite3.connect(f"file:{snapshot}?mode=ro", uri=True)
    try:
        integrity = chk.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise SystemExit(f"snapshot failed integrity_check: {integrity}")
        tables = chk.execute(
            "select count(*) from sqlite_master where type='table' and name not like 'sqlite_%'"
        ).fetchone()[0]
        if tables < min_tables:
            raise SystemExit(
                f"snapshot has only {tables} tables (expected >= {min_tables}); "
                f"refusing to keep a backup of the wrong database"
            )
    finally:
        chk.close()

    db_sha = hashlib.sha256(snapshot.read_bytes()).hexdigest()

    uploads_root = pathlib.Path(uploads_dir)
    upload_files = [p for p in uploads_root.rglob("*") if p.is_file()]

    manifest = {
        "format": 1,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": {"database": str(src_db), "uploads": str(uploads_root)},
        "database": {
            "file": "portal.db",
            "bytes": snapshot.stat().st_size,
            "sha256": db_sha,
            "tables": tables,
        },
        "uploads": {"files": len(upload_files)},
    }

    # Write to a partial name and rename, so a crash never leaves a truncated
    # archive that a freshness check would happily accept.
    with zipfile.ZipFile(partial, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        zf.write(snapshot, "portal.db")
        for path in upload_files:
            zf.write(path, str(pathlib.Path("uploads") / path.relative_to(uploads_root)))
        zf.writestr("manifest.json", json.dumps(manifest, indent=2) + "\n")

    # Read the archive back before publishing it. A zip that cannot be re-opened
    # is not a backup.
    with zipfile.ZipFile(partial) as zf:
        bad = zf.testzip()
        if bad is not None:
            raise SystemExit(f"archive CRC failure at {bad}")
        if "portal.db" not in zf.namelist():
            raise SystemExit("archive is missing portal.db")
        if "manifest.json" not in zf.namelist():
            raise SystemExit("archive is missing manifest.json")

    os.replace(partial, archive)
    os.chmod(archive, 0o600)

    digest = hashlib.sha256()
    with archive.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    sidecar = archive.with_name(archive.name + ".sha256")
    sidecar.write_text(f"{digest.hexdigest()}  {archive.name}\n")
    os.chmod(sidecar, 0o600)

    for old in sorted(dest_dir.glob("ieee-sqlite-*.zip"), key=lambda p: p.stat().st_mtime, reverse=True)[max_keep:]:
        old.unlink(missing_ok=True)
        old.with_name(old.name + ".sha256").unlink(missing_ok=True)

    print(
        f"backed up {archive.name}: {tables} tables, "
        f"{snapshot.stat().st_size} bytes db, {len(upload_files)} uploads, "
        f"{archive.stat().st_size} bytes archive, sha256 {digest.hexdigest()[:16]}"
    )
finally:
    shutil.rmtree(work, ignore_errors=True)
    if partial.exists():
        partial.unlink(missing_ok=True)
PYEOF

	logger -t ieee-backup-export "wrote and verified ${DEST}/ieee-sqlite-*.zip"
}

# ---------------------------------------------------------------------------
# restore
# ---------------------------------------------------------------------------

do_restore() {
	local archive="${2:-}"
	local target="${3:-}"
	local force="${4:-}"

	[[ -n "$archive" ]] || die "usage: ieee-backup-export.sh restore <archive.zip> <target-dir> [--force]"
	[[ -n "$target" ]] || die "usage: ieee-backup-export.sh restore <archive.zip> <target-dir> [--force]"
	[[ -f "$archive" ]] || die "archive not found: $archive"
	command -v python3 >/dev/null 2>&1 || die "python3 is required"

	# Refuse to write over a live database unless told to. The whole point of a
	# restore rehearsal is that it cannot touch the thing it is rehearsing for.
	if [[ -e "$target/portal.db" && "$force" != "--force" ]]; then
		die "$target/portal.db already exists; pass --force to overwrite"
	fi

	mkdir -p "$target"

	python3 - "$archive" "$target" "$MIN_TABLES" <<'PYEOF'
import hashlib, json, pathlib, sqlite3, sys, zipfile

archive, target, min_tables = sys.argv[1], pathlib.Path(sys.argv[2]), int(sys.argv[3])

with zipfile.ZipFile(archive) as zf:
    bad = zf.testzip()
    if bad is not None:
        raise SystemExit(f"archive CRC failure at {bad}")

    names = zf.namelist()
    for required in ("portal.db", "manifest.json"):
        if required not in names:
            raise SystemExit(f"archive is missing {required}")

    manifest = json.loads(zf.read("manifest.json"))

    # Path containment: a crafted archive must not write outside the target.
    for name in names:
        resolved = (target / name).resolve()
        if target.resolve() not in resolved.parents and resolved != target.resolve():
            raise SystemExit(f"archive entry escapes the target directory: {name}")

    zf.extractall(target)

db = target / "portal.db"
expected_sha = manifest["database"]["sha256"]
actual_sha = hashlib.sha256(db.read_bytes()).hexdigest()
if actual_sha != expected_sha:
    raise SystemExit(
        f"portal.db sha256 mismatch: manifest {expected_sha[:16]}, extracted {actual_sha[:16]}"
    )

con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
try:
    integrity = con.execute("PRAGMA integrity_check").fetchone()[0]
    if integrity != "ok":
        raise SystemExit(f"restored database failed integrity_check: {integrity}")
    fk = con.execute("PRAGMA foreign_key_check").fetchall()
    if fk:
        raise SystemExit(f"restored database has {len(fk)} foreign key violations")
    tables = con.execute(
        "select count(*) from sqlite_master where type='table' and name not like 'sqlite_%'"
    ).fetchone()[0]
finally:
    con.close()

if tables < min_tables:
    raise SystemExit(f"restored database has only {tables} tables (expected >= {min_tables})")

uploads = target / "uploads"
restored_files = len([p for p in uploads.rglob("*") if p.is_file()]) if uploads.exists() else 0
expected_files = manifest["uploads"]["files"]
if restored_files != expected_files:
    raise SystemExit(f"uploads file count mismatch: manifest {expected_files}, restored {restored_files}")

print(
    f"restored {pathlib.Path(archive).name} -> {target}: "
    f"{tables} tables, integrity ok, 0 fk violations, "
    f"{restored_files} uploads, sha256 verified"
)
PYEOF
}

case "$MODE" in
	backup) do_backup ;;
	restore) do_restore "$@" ;;
	*) die "unknown mode: $MODE (expected 'backup' or 'restore')" ;;
esac
