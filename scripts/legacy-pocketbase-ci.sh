#!/usr/bin/env bash
#
# Run the historical PocketBase smoke suites by hand.
#
# PocketBase is the rollback target, not a running part of the app: `/api` is
# served by the web app, and the smoke suites below exercise PocketBase hooks
# and collections that only matter while the rollback target still has to build
# and, if ever needed, migrate. They left normal CI on 2026-11-24 so the PR lane
# tests the code that ships (see docs/legacy-tooling.md).
#
#   scripts/legacy-pocketbase-ci.sh            # build, boot, run every suite,
#                                              # then prove the migration runs
#   scripts/legacy-pocketbase-ci.sh --smoke    # skip the migration step
#   scripts/legacy-pocketbase-ci.sh --keep     # leave the container running
#
# It uses a dedicated container name and a loopback port, never touches a
# PocketBase volume, and never touches application data:
#
#   docker rm -f ieee-pocketbase-legacy   # only if a previous run was --keep
#
# Requirements: docker (BuildKit), python3, bun, curl, an arm64/amd64 host.
# Nothing here reads .env or any deployment secret: every value is a literal
# test value defined below.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CONTAINER=ieee-pocketbase-legacy
IMAGE=ieee-pocketbase-legacy
PORT="${PB_LEGACY_PORT:-18090}"
SMTP_PORT="${PB_LEGACY_SMTP_PORT:-18082}"
SUPERUSER_EMAIL="ci-super@example.test"
SUPERUSER_PASSWORD="CI-PocketBase-Smoke-2026!"
ENCRYPTION_KEY="0123456789abcdef0123456789abcdef"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ieee-pocketbase-legacy.XXXXXX")"

run_migration=1
keep=0
for arg in "$@"; do
	case "$arg" in
		--smoke) run_migration=0 ;;
		--keep) keep=1 ;;
		-h|--help) sed -n '2,26p' "$0"; exit 0 ;;
		*) echo "unknown argument: $arg" >&2; exit 2 ;;
	esac
done


wait_for() {
	local url=$1 attempts=$2
	for _ in $(seq 1 "$attempts"); do
		curl -fsS "$url" >/dev/null 2>&1 && return 0
		sleep 1
	done
	return 1
}

echo "== build the PocketBase image"
docker buildx build --load -t "$IMAGE" -f pocketbase/Dockerfile .

echo "== fake SMTP on 127.0.0.1:$SMTP_PORT"
SMTP_FAKE_PORT="$SMTP_PORT" SMTP_CAPTURE_PATH="$WORK_DIR/fake-smtp-messages.jsonl" \
	python3 tests/backend/fake_smtp.py > "$WORK_DIR/fake-smtp.log" 2>&1 &
SMTP_PID=$!

# One cleanup trap, installed after the SMTP server exists so it never references
# an unset pid. `--keep` leaves the container and the work directory in place.
cleanup() {
	kill "$SMTP_PID" >/dev/null 2>&1 || true
	if [ "$keep" -eq 0 ]; then
		docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
		rm -rf "$WORK_DIR"
	else
		echo "kept: container $CONTAINER on 127.0.0.1:$PORT, work dir $WORK_DIR"
		echo "clean up with: docker rm -f $CONTAINER && rm -rf $WORK_DIR"
	fi
}
trap cleanup EXIT
python3 - "$SMTP_PORT" <<'PY'
import socket, sys, time
port = int(sys.argv[1])
for _ in range(20):
    try:
        socket.create_connection(("127.0.0.1", port), timeout=1).close()
        sys.exit(0)
    except OSError:
        time.sleep(1)
sys.exit(1)
PY

echo "== start PocketBase on 127.0.0.1:$PORT"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" \
	--add-host=host.docker.internal:host-gateway \
	-p "127.0.0.1:$PORT:8090" \
	-e DEPLOY_ENV=staging \
	-e PB_ENCRYPTION_KEY="$ENCRYPTION_KEY" \
	-e PAYGATE_URL='http://host.docker.internal:18081' \
	-e PAYGATE_API_KEY='CI-PayGate-Api-Key-2026-Only-Test-32' \
	-e PAYGATE_WEBHOOK_SECRET='CI-PayGate-Webhook-2026-Only-Test-32' \
	-e PAYGATE_REGISTRATION_GRACE_SECONDS='600' \
	-e CERTIFICATE_RENDER_CAPABILITY_KEY='CI-Certificate-Render-Capability-2026-Only-Test' \
	-e MAIL_DELIVERY_MODE='redirect' \
	-e MAIL_REDIRECT_TO='ci-certificate-sink@example.test' \
	-e SMTP_HOST='host.docker.internal' \
	-e SMTP_PORT="$SMTP_PORT" \
	-e SMTP_TLS='false' \
	-e SMTP_FROM='IEEE Sahrdaya <ci-sender@example.test>' \
	"$IMAGE" >/dev/null

if ! wait_for "http://127.0.0.1:$PORT/api/health" 60; then
	docker logs "$CONTAINER" || true
	echo "PocketBase did not become healthy" >&2
	exit 1
fi

docker exec "$CONTAINER" ./pocketbase superuser upsert \
	"$SUPERUSER_EMAIL" "$SUPERUSER_PASSWORD" --encryptionEnv=PB_ENCRYPTION_KEY

export PB_BASE_URL="http://127.0.0.1:$PORT"
export PB_SUPERUSER_EMAIL="$SUPERUSER_EMAIL"
export PB_SUPERUSER_PASSWORD="$SUPERUSER_PASSWORD"
export E2E_WORKSPACE_FIXTURE="$WORK_DIR/community-workspace-e2e.json"
export SMTP_CAPTURE_PATH="$WORK_DIR/fake-smtp-messages.jsonl"
export CERTIFICATE_RENDER_CAPABILITY_KEY='CI-Certificate-Render-Capability-2026-Only-Test'
export PAYGATE_API_KEY='CI-PayGate-Api-Key-2026-Only-Test-32'
export PAYGATE_WEBHOOK_SECRET='CI-PayGate-Webhook-2026-Only-Test-32'
export PAYGATE_FAKE_PORT='18081'

echo "== backend invariants"
python3 tests/backend/pocketbase_smoke.py
python3 tests/backend/community_roles_smoke.py

for suite in \
	certificate_template_smoke.py \
	certificate_issuance_smoke.py \
	certificate_bulk_smoke.py \
	certificate_public_smoke.py \
	certificate_delivery_smoke.py \
	certificate_lifecycle_smoke.py \
	paygate_smoke.py
do
	echo "== $suite"
	python3 "tests/backend/$suite"
done

if [ "$run_migration" -eq 1 ]; then
	echo "== prove the PocketBase -> SQLite migration runs on populated data"
	docker cp "$CONTAINER:/pb/pb_data" "$WORK_DIR/pb-data"
	# The migration opens the target directly, so its directory has to exist.
	mkdir -p "$WORK_DIR/migration/uploads"
	bunx tsx scripts/migrate-pb-to-sqlite.ts \
		--source "$WORK_DIR/pb-data/data.db" \
		--storage "$WORK_DIR/pb-data/storage" \
		--target "$WORK_DIR/migration/portal.db" \
		--uploads "$WORK_DIR/migration/uploads" \
		--id-map "$WORK_DIR/migration/id-map.json" \
		--apply
fi

echo "legacy PocketBase suites passed"
