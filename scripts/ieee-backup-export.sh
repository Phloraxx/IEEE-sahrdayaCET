#!/usr/bin/env bash
set -euo pipefail
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

VOLUME="${IEEE_PB_VOLUME:-ieee-rewrite-i9ir8q_pb_data}"
DEST="${IEEE_BACKUP_EXPORT_DIR:-/home/drvij/ieee-backups/daily}"
LOCK="${IEEE_BACKUP_LOCK:-/tmp/ieee-backup-export.lock}"
MAX_KEEP="${IEEE_BACKUP_MAX_KEEP:-30}"
MAX_AGE_SECONDS="${IEEE_BACKUP_MAX_AGE_SECONDS:-21600}"

exec 9>"$LOCK"
flock -n 9 || exit 0
mkdir -p "$DEST"
uid=$(id -u)
gid=$(id -g)

docker run --rm -i \
  -e OWNER_UID="$uid" -e OWNER_GID="$gid" \
  -e MAX_KEEP="$MAX_KEEP" -e MAX_AGE_SECONDS="$MAX_AGE_SECONDS" \
  -v "$VOLUME:/source:ro" \
  -v "$DEST:/dest" \
  python:3.12-alpine python - <<'PY'
import hashlib, os, pathlib, shutil, sqlite3, tempfile, time, zipfile

source = pathlib.Path('/source/backups')
dest = pathlib.Path('/dest')
files = sorted(source.glob('*.zip'), key=lambda p: p.stat().st_mtime, reverse=True)
if not files:
    raise SystemExit('no PocketBase backup archive found')
latest = files[0]
age = max(0, int(time.time() - latest.stat().st_mtime))
max_age = int(os.environ['MAX_AGE_SECONDS'])
if age > max_age:
    raise SystemExit(f'latest PocketBase backup is stale: age={age}s max={max_age}s')

target = dest / latest.name
temp = dest / (latest.name + '.tmp')
shutil.copy2(latest, temp)
os.replace(temp, target)

with zipfile.ZipFile(target) as archive:
    bad = archive.testzip()
    if bad is not None:
        raise SystemExit(f'backup ZIP CRC failure at {bad}')
    with tempfile.TemporaryDirectory() as td:
        archive.extractall(td)
        checked = 0
        for name in ('data.db', 'auxiliary.db'):
            db = pathlib.Path(td) / name
            if not db.exists():
                continue
            con = sqlite3.connect(f'file:{db}?mode=ro', uri=True)
            result = con.execute('PRAGMA integrity_check').fetchone()[0]
            con.close()
            if result != 'ok':
                raise SystemExit(f'{name} integrity_check={result}')
            checked += 1
        if checked < 1:
            raise SystemExit('backup contains no root SQLite database to verify')

h = hashlib.sha256()
with target.open('rb') as f:
    for chunk in iter(lambda: f.read(1024 * 1024), b''):
        h.update(chunk)
sha = dest / (latest.name + '.sha256')
sha.write_text(f'{h.hexdigest()}  {latest.name}\n')

uid = int(os.environ['OWNER_UID'])
gid = int(os.environ['OWNER_GID'])
for path in (target, sha):
    os.chmod(path, 0o600)
    os.chown(path, uid, gid)

max_keep = int(os.environ['MAX_KEEP'])
exports = sorted(dest.glob('*.zip'), key=lambda p: p.stat().st_mtime, reverse=True)
for old in exports[max_keep:]:
    old.unlink(missing_ok=True)
    (dest / (old.name + '.sha256')).unlink(missing_ok=True)

print(f'verified {target.name} ({target.stat().st_size} bytes, age={age}s)')
PY

logger -t ieee-backup-export "verified and exported latest IEEE PocketBase backup"
