#!/usr/bin/env bash
#
# Break-glass deployment: build and switch one Dokploy compose service without
# GitHub, the CD workflow or the Dokploy webhook.
#
# Use this only when CI/CD is unavailable or a hotfix cannot wait for the normal
# path. It runs the same checks CI runs, builds the image with the same compose
# file Dokploy uses, and recreates only the web service. PocketBase is left
# untouched.
#
#   sudo ./scripts/deploy-local.sh                  # production, with tests
#   sudo ./scripts/deploy-local.sh --staging        # staging
#   sudo ./scripts/deploy-local.sh --skip-tests     # incident hotfix
#   sudo ./scripts/deploy-local.sh --dry-run        # print the plan
#
set -euo pipefail

TARGET="production"
SKIP_TESTS=0
ASSUME_YES=0
DRY_RUN=0

usage() {
	sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
	case "$1" in
		--staging) TARGET="staging" ;;
		--production) TARGET="production" ;;
		--skip-tests) SKIP_TESTS=1 ;;
		--yes|-y) ASSUME_YES=1 ;;
		--dry-run) DRY_RUN=1 ;;
		--help|-h) usage; exit 0 ;;
		*) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
	esac
	shift
done

case "$TARGET" in
	production)
		CODE_DIR="/etc/dokploy/compose/ieee-rewrite-i9ir8q/code"
		PROJECT="ieee-rewrite-i9ir8q"
		HOST="ieeesahrdaya.com"
		BRANCH="deploy/production"
		;;
	staging)
		CODE_DIR="/etc/dokploy/compose/ieee-dev-staging/code"
		PROJECT="ieee-dev-staging"
		HOST="staging.ieeesahrdaya.com"
		BRANCH="deploy/staging"
		;;
esac

die() { echo "error: $*" >&2; exit 1; }
step() { printf '\n==> %s\n' "$*"; }

if [[ "$DRY_RUN" -eq 0 && "${EUID}" -ne 0 ]]; then
	die "run with sudo: the compose environment file and Docker socket are root-owned"
fi

[[ -d "$CODE_DIR" ]] || die "compose checkout not found: $CODE_DIR"
[[ -f "$CODE_DIR/.env" ]] || die "compose environment file not found: $CODE_DIR/.env (refusing to guess secrets)"
[[ -f "$CODE_DIR/docker-compose.yml" ]] || die "compose file not found: $CODE_DIR/docker-compose.yml"

cd "$CODE_DIR"

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
CURRENT_SHA="$(git rev-parse HEAD)"
SHORT_SHA="$(git rev-parse --short HEAD)"
SUBJECT="$(git log -1 --pretty=%s)"
if [[ -n "$(git status --porcelain)" ]]; then
	if [[ "$DRY_RUN" -eq 1 ]]; then
		echo "warning: the compose checkout has uncommitted changes; a real run would refuse"
	else
		die "the compose checkout has uncommitted changes; commit or discard them first"
	fi
fi
if [[ "$CURRENT_BRANCH" != "$BRANCH" ]]; then
	die "expected branch $BRANCH, found $CURRENT_BRANCH (refusing to deploy the wrong commit)"
fi

cat <<EOF

Target:   $TARGET ($HOST)
Checkout: $CODE_DIR
Branch:   $CURRENT_BRANCH @ $SHORT_SHA
Commit:   $SUBJECT
Tests:    $([[ "$SKIP_TESTS" -eq 1 ]] && echo skipped || echo "typecheck + unit")
EOF

if [[ "$DRY_RUN" -eq 1 ]]; then
	cat <<EOF

Plan:
  1. bun install --frozen-lockfile
  2. bun run typecheck$([[ "$SKIP_TESTS" -eq 1 ]] && echo ' (skipped)' || echo ' && bun run test')
  3. docker compose -p $PROJECT --env-file .env -f docker-compose.yml build web
  4. docker compose -p $PROJECT --env-file .env -f docker-compose.yml up -d --no-build web
  5. wait for https://$HOST/healthz
EOF
	exit 0
fi

if [[ "$ASSUME_YES" -eq 0 ]]; then
	read -r -p "Deploy $SHORT_SHA to $TARGET? [y/N] " reply
	[[ "$reply" =~ ^[Yy]$ ]] || { echo "aborted"; exit 1; }
fi

step "Installing dependencies"
bun install --frozen-lockfile

if [[ "$SKIP_TESTS" -eq 0 ]]; then
	step "Typecheck and unit tests"
	bun run typecheck
	bun run test
else
	echo "==> Tests skipped at operator request"
fi

step "Building the web image"
docker compose -p "$PROJECT" --env-file .env -f docker-compose.yml build web

step "Switching the web container"
docker compose -p "$PROJECT" --env-file .env -f docker-compose.yml up -d --no-build web

step "Waiting for $HOST"
for _ in $(seq 1 60); do
	if body="$(curl -fsS -m 5 "https://$HOST/healthz" 2>/dev/null)" && [[ "$body" == *'"renderCache"'* ]]; then
		echo "$HOST is healthy: $body"
		echo
		echo "Deployed $SHORT_SHA to $TARGET."
		echo "Rollback: check out the previous deploy/production ref in $CODE_DIR, then re-run this script."
		exit 0
	fi
	sleep 2
done

echo "error: $HOST did not report a healthy new build within 120 s" >&2
echo "Inspect: docker logs $(docker compose -p "$PROJECT" ps -q web 2>/dev/null | head -1) --tail 100" >&2
echo "If needed, redeploy the previous commit from $CODE_DIR and run this script again." >&2
exit 1
