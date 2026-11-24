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
# Every build is labelled with the commit (and its tree) it was built from, and
# the health gate verifies the container that came up reports that commit. A
# stack that reuses an image, a container that was not replaced, or a deploy
# that half-applied is reported as a failure instead of as a success assumed
# from a 200 on /healthz.
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
	sed -n '2,31p' "$0" | sed 's/^# \{0,1\}//'
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
ENV_FILE="$CODE_DIR/.env"
[[ -f "$ENV_FILE" ]] || die "compose environment file not found: $ENV_FILE (refusing to guess secrets)"

# Which tree supplies the compose file:
#
#   staging     your worktree — it is the commit being deployed, it is clean,
#               and it is readable by you. The Dokploy checkout is root-owned
#               and git refuses to fetch into it, so it supplies the .env only.
#   production  the Dokploy checkout at the CI-pinned ref.
if [[ -z "$BRANCH" ]]; then
	COMPOSE_DIR="$CHECK_DIR"
	[[ -f "$COMPOSE_DIR/docker-compose.yml" ]] || die "compose file not found: $COMPOSE_DIR/docker-compose.yml"
	STAGING_DIRT="$(git -C "$CHECK_DIR" status --porcelain -- src tests sqlite package.json bun.lock public)"
	[[ -z "$STAGING_DIRT" ]] || die "staging deploys the commit you have checked out, so it must be clean:
$STAGING_DIRT"
	CURRENT_SHA="$(git -C "$CHECK_DIR" rev-parse HEAD)"
	if [[ -z "$(git -C "$CHECK_DIR" branch -r --contains "$CURRENT_SHA" 2>/dev/null | head -1)" ]]; then
		die "commit ${CURRENT_SHA:0:8} is not on any remote branch; push it first (git push origin HEAD:dev)"
	fi
else
	COMPOSE_DIR="$CODE_DIR"
	[[ -f "$COMPOSE_DIR/docker-compose.yml" ]] || die "compose file not found: $COMPOSE_DIR/docker-compose.yml"
	CURRENT_SHA="$(git -C "$CODE_DIR" rev-parse HEAD)"
fi

cd "$COMPOSE_DIR"

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
SHORT_SHA="$(git rev-parse --short HEAD)"
SUBJECT="$(git log -1 --pretty=%s)"

# Build identity, taken from the tree being deployed. The tree is what a merge
# preserves, so a staging deploy can be compared against the commit an operator
# has, and a production break-glass deploy against the commit CD pinned, without
# either side having to know which SHA spelling the other used.
#
# `git rev-parse` reads the repository that holds the compose file. For staging
# that is this worktree; for production break-glass it is the Dokploy checkout,
# which is the CI-pinned commit and must match the image being built.
GIT_COMMIT_FULL="$(git rev-parse HEAD)"
GIT_TREE_FULL="$(git rev-parse 'HEAD^{tree}')"
GIT_BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export GIT_COMMIT="$GIT_COMMIT_FULL"
export GIT_TREE="$GIT_TREE_FULL"
export GIT_BUILT_AT

if [[ -n "$BRANCH" ]]; then
	# Dokploy rewrites docker-compose.yml on every deploy (it strips comments)
	# and drops docker-compose.local.yml beside it, so the checkout is always
	# "dirty" in that file. Accept that; refuse on real edits.
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
	if [[ "$CURRENT_BRANCH" != "$BRANCH" ]]; then
		die "expected branch $BRANCH, found $CURRENT_BRANCH (refusing to deploy the wrong commit)"
	fi
	# Break-glass production deploys the commit CD pinned, so the checkout's HEAD
	# must be that commit. `deploy/production` is where CD force-moves the pinned
	# SHA; comparing it short-circuits "I redeployed an old checkout by mistake".
	# A checkout that has never fetched the ref is not evidence of a mistake, so
	# the comparison only runs when the ref exists.
	PINNED="$(git rev-parse --verify --quiet "refs/remotes/origin/$BRANCH^{commit}" || true)"
	if [[ -n "$PINNED" && "$PINNED" != "$GIT_COMMIT_FULL" ]]; then
		if [[ "$DRY_RUN" -eq 1 ]]; then
			echo "warning: checkout HEAD ${SHORT_SHA} is not origin/$BRANCH ${PINNED:0:8}; a real run would refuse"
		else
			die "checkout HEAD ${SHORT_SHA} is not origin/$BRANCH ${PINNED:0:8}; fetch and check out the pinned deploy commit first"
		fi
	fi
fi

cat <<EOF

Target:   $TARGET ($HOST)
Compose:  $COMPOSE_DIR
Source:   $([[ -n "$BRANCH" ]] && echo "CI-pinned $CURRENT_BRANCH" || echo "your worktree") @ $SHORT_SHA
Commit:   $SUBJECT
Tree:     $GIT_TREE_FULL
Checks:   $([[ "$SKIP_TESTS" -eq 1 ]] && echo skipped || echo "typecheck + unit in $CHECK_DIR")
EOF

if [[ "$DRY_RUN" -eq 1 ]]; then
	cat <<EOF

Plan:
  1. bun install --frozen-lockfile --ignore-scripts (only if bun.lock moved)
  2. bun run typecheck$([[ "$SKIP_TESTS" -eq 1 ]] && echo ' (skipped)' || echo ' && bun run test')
  3. docker compose -p $PROJECT --env-file "$ENV_FILE" -f docker-compose.yml build web
       with GIT_COMMIT=$GIT_COMMIT_FULL, GIT_TREE=$GIT_TREE_FULL
  4. docker compose -p $PROJECT --env-file "$ENV_FILE" -f docker-compose.yml up -d --no-build web
  5. wait for https://$HOST/healthz to answer 200 with build == fingerprint($GIT_COMMIT_FULL)
  6. print the running container's image and baked commit
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
docker compose -p "$PROJECT" --env-file "$ENV_FILE" -f docker-compose.yml build web

step "Switching the web container"
docker compose -p "$PROJECT" --env-file "$ENV_FILE" -f docker-compose.yml up -d --no-build web

# What the container is actually running: image, creation, and the commit the
# image was built from. Printed before the gate so a mismatch is visible even if
# the gate is what reports it.
step "Running container"
WEB_CONTAINER="$(docker compose -p "$PROJECT" --env-file "$ENV_FILE" -f docker-compose.yml ps -q web 2>/dev/null | head -1)"
if [[ -z "$WEB_CONTAINER" ]]; then
	echo "error: the $PROJECT web service has no container after 'up'" >&2
	exit 1
fi
docker inspect -f 'container {{.Name}}  state={{.State.Status}}  image={{.Image}}
  created={{.Created}}  started={{.State.StartedAt}}' "$WEB_CONTAINER" || true
if BAKED_COMMIT="$(docker exec "$WEB_CONTAINER" cat /app/build/git-commit 2>/dev/null)"; then
	echo "  baked commit: ${BAKED_COMMIT:-<none>}"
	if [[ -n "$BAKED_COMMIT" && "$BAKED_COMMIT" != "$GIT_COMMIT_FULL" ]]; then
		echo "error: the running image was built from ${BAKED_COMMIT:0:12}, not ${GIT_COMMIT_FULL:0:12}" >&2
		echo "This is the failure the gate exists for: a stack that reused an image." >&2
		exit 1
	fi
else
	echo "  baked commit: unreadable (the image predates the identity files)"
fi

# The fingerprint the app publishes on /healthz for this build. Must match
# src/server/build-identity.server.ts: sha256("ieee-tree\0" + tree)[0..16].
#
# Tree only, not commit+tree: a release PR merging to main produces a merge
# commit whose SHA differs from the tested head while the tree — and therefore
# the image — is identical. Keying on the commit would report a correct deploy as
# a mismatch.
expected_build="$(
	WORD=$(printf 'ieee-tree\0%s' "$GIT_TREE_FULL")
	printf '%s' "$WORD" | sha256sum | cut -c1-16
)"

step "Waiting for $HOST to report build ${expected_build:-<unknown>}"
deadline=$((SECONDS + 120))
while (( SECONDS < deadline )); do
	body="$(curl -fsS -m 5 "https://$HOST/healthz" 2>/dev/null || true)"
	if [[ -n "$body" ]]; then
		# Read the two fields with jq when it is present (it is on the CI
		# runners and on this host), and fall back to a strict grep so a host
		# without jq still gets the identity check, just not the status one.
		if command -v jq >/dev/null 2>&1; then
			reported_build="$(jq -r '.build // ""' <<<"$body")"
			reported_ok="$(jq -r '.ok // false' <<<"$body")"
		else
			reported_build="$(grep -o '"build":"[0-9a-f]*"' <<<"$body" | head -1 | cut -d'"' -f4)"
			reported_ok="false"
			[[ "$body" == *'"ok":true'* ]] && reported_ok="true"
		fi
		if [[ "$reported_ok" != "true" ]]; then
			echo "  /healthz is reporting not-ready: $body"
		elif [[ -n "$expected_build" && "$reported_build" != "$expected_build" ]]; then
			echo "  /healthz reports build '${reported_build:-<none>}', expected $expected_build"
			echo "  (the new container is not the one answering; check the Traefik router and the container above)"
		else
			echo "$HOST is healthy: $body"
			echo
			echo "Deployed $SHORT_SHA ($GIT_TREE_FULL) to $TARGET."
			echo "If the running container's creation time above is older than this run, the deploy did not replace it."
			echo "Rollback: repoint deploy/production to the previous commit and let CD deploy it"
			exit 0
		fi
	fi
	sleep 2
done

echo "error: $HOST did not report a healthy new build within 120 s" >&2
echo "Expected build fingerprint: ${expected_build:-<unknown>}" >&2
echo "Inspect: docker logs $(docker compose -p "$PROJECT" ps -q web 2>/dev/null | head -1) --tail 100" >&2
echo "If needed, redeploy the previous commit from $CODE_DIR and run this script again." >&2
exit 1
