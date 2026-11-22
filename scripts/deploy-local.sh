#!/usr/bin/env bash
#
# Deploy one Dokploy compose service from your machine.
#
# Two lanes, on purpose:
#
#   --staging    The default for iteration. Deploys the commit you have checked
#                out (it must be pushed), runs typecheck and the unit suite
#                first, and never waits for CI.
#
#   (default)    Production break-glass: the same checks, but only against the
#                commit CD pinned to deploy/production, i.e. one that already
#                passed CI. Normal production releases go through a pull
#                request; this exists for outages and hotfixes.
#
# It builds the image with the same compose file Dokploy uses and recreates only
# the web service; PocketBase is left untouched. Production normally pulls a
# prebuilt image from GHCR instead of building, which is why the compose file
# keeps its build section: this script tags the image WEB_IMAGE from the
# environment file, and the next CD deploy pulls and replaces it.
#
#   ./scripts/deploy-local.sh                  # production, with tests
#   ./scripts/deploy-local.sh --staging        # staging
#   ./scripts/deploy-local.sh --skip-tests     # incident hotfix
#   ./scripts/deploy-local.sh --dry-run        # print the plan
#
# Runs as your own user (Docker group), not as root: the unit suite misbehaves
# under root, and there is nothing here that needs it.
#
set -euo pipefail

TARGET="production"
SKIP_TESTS=0
ASSUME_YES=0
DRY_RUN=0

usage() {
	sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'
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
		# Staging follows your worktree, not a CI-pinned ref: empty BRANCH means
		# "deploy the commit I have checked out".
		BRANCH=""
		;;
esac

die() { echo "error: $*" >&2; exit 1; }
step() { printf '\n==> %s\n' "$*"; }

# The checks run in your working tree (its node_modules belong to you); the
# Dokploy checkout is root-owned and only supplies the compose file and .env.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [[ "$DRY_RUN" -eq 0 ]] && ! docker info >/dev/null 2>&1; then
	die "docker is not reachable; run as a user in the docker group"
fi

# sudo resets PATH, and bun lives in the invoking user's home. Borrow it, then
# fail with a useful message instead of "bun: command not found".
if [[ -n "${SUDO_USER:-}" ]]; then
	SUDO_HOME="$(getent passwd "$SUDO_USER" | cut -d: -f6)"
	if [[ -n "$SUDO_HOME" ]]; then
		PATH="$SUDO_HOME/.bun/bin:$PATH"
		export PATH
	fi
fi
command -v bun >/dev/null 2>&1 || die "bun is not on PATH; install it or run this as the user that owns it"

[[ -d "$CODE_DIR" ]] || die "compose checkout not found: $CODE_DIR"
[[ -f "$CODE_DIR/.env" ]] || die "compose environment file not found: $CODE_DIR/.env (refusing to guess secrets)"
[[ -f "$CODE_DIR/docker-compose.yml" ]] || die "compose file not found: $CODE_DIR/docker-compose.yml"

if [[ -z "$BRANCH" ]]; then
	STAGING_DIRT="$(git -C "$CHECK_DIR" status --porcelain -- src tests sqlite package.json bun.lock public)"
	[[ -z "$STAGING_DIRT" ]] || die "staging deploys the commit you have checked out, so it must be clean:
$STAGING_DIRT"
	WANTED_SHA="$(git -C "$CHECK_DIR" rev-parse HEAD)"
	if [[ "$DRY_RUN" -eq 0 ]]; then
		git -C "$CODE_DIR" fetch --quiet origin || die "could not fetch in $CODE_DIR"
		git -C "$CODE_DIR" checkout --quiet --detach "$WANTED_SHA" 2>/dev/null \
			|| die "commit ${WANTED_SHA:0:8} is not on origin yet; push it first (git push origin HEAD:dev)"
	fi
fi

cd "$CODE_DIR"

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
CURRENT_SHA="$(git rev-parse HEAD)"
SHORT_SHA="$(git rev-parse --short HEAD)"
SUBJECT="$(git log -1 --pretty=%s)"
# Dokploy re-writes docker-compose.yml on every deploy (it strips comments) and
# drops docker-compose.local.yml beside it, so the checkout is always "dirty" in
# that file. Treat that as expected and refuse only on real edits.
DIRT="$(git status --porcelain -- . ':(exclude)docker-compose.yml' ':(exclude)docker-compose.local.yml')"
if [[ -n "$DIRT" ]]; then
	if [[ "$DRY_RUN" -eq 1 ]]; then
		echo "warning: the compose checkout has uncommitted changes; a real run would refuse"
		echo "$DIRT"
	else
		echo "$DIRT" >&2
		die "the compose checkout has uncommitted changes; commit or discard them first"
	fi
fi
if ! git diff --quiet -- docker-compose.yml; then
	echo "note: docker-compose.yml differs from $SHORT_SHA because Dokploy rewrites it; deploying it as-is"
fi
if [[ -n "$BRANCH" && "$CURRENT_BRANCH" != "$BRANCH" ]]; then
	die "expected branch $BRANCH, found $CURRENT_BRANCH (refusing to deploy the wrong commit)"
fi

WORKTREE_SHA="$(git -C "$CHECK_DIR" rev-parse HEAD 2>/dev/null || echo "")"
if [[ "$SKIP_TESTS" -eq 0 ]]; then
	[[ -n "$WORKTREE_SHA" ]] || die "$CHECK_DIR is not a git checkout; cannot run the checks"
	[[ "$WORKTREE_SHA" == "$CURRENT_SHA" ]] || die "your worktree is at ${WORKTREE_SHA:0:8} but the deploy checkout is at $SHORT_SHA; check out $CURRENT_BRANCH first or commit"
	if ! git -C "$CHECK_DIR" diff --quiet -- src tests sqlite package.json bun.lock; then
		echo "warning: your worktree has uncommitted source changes; the tests cover the committed tree only"
	fi
fi

cat <<EOF

Target:   $TARGET ($HOST)
Checkout: $CODE_DIR
Source:   $([[ -n "$BRANCH" ]] && echo "CI-pinned $CURRENT_BRANCH" || echo "your worktree") @ $SHORT_SHA
Commit:   $SUBJECT
Checks:   $([[ "$SKIP_TESTS" -eq 1 ]] && echo skipped || echo "typecheck + unit in $CHECK_DIR")
EOF

if [[ "$DRY_RUN" -eq 1 ]]; then
	cat <<EOF

Plan:
  1. bun install --frozen-lockfile --ignore-scripts (only if bun.lock moved)
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

if [[ "$SKIP_TESTS" -eq 0 ]]; then
	step "Typecheck and unit tests in $CHECK_DIR"
	(
		cd "$CHECK_DIR"
		# The host has no C toolchain on purpose (the image builds its own native
		# modules), so a plain `bun install` fails on better-sqlite3's postinstall.
		# Reuse the worktree's node_modules; refresh it only when the lockfile moved.
		if [[ ! -d node_modules ]] || [[ bun.lock -nt node_modules ]]; then
			bun install --frozen-lockfile --ignore-scripts
		else
			echo "node_modules is current; skipping install"
		fi
		bun run typecheck
		bun run test
	)
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
		echo "Rollback: repoint deploy/production to the previous commit and let CD deploy it"
		exit 0
	fi
	sleep 2
done

echo "error: $HOST did not report a healthy new build within 120 s" >&2
echo "Inspect: docker logs $(docker compose -p "$PROJECT" ps -q web 2>/dev/null | head -1) --tail 100" >&2
echo "If needed, redeploy the previous commit from $CODE_DIR and run this script again." >&2
exit 1
