#!/usr/bin/env bash
# Full staging audit. Run from the repository root: scripts/audit/run-staging-audit.sh
#
# Creates temporary rows and sessions on STAGING and removes them again. It never
# touches production. Staging mail delivery is disabled, so nothing is emailed.
set -euo pipefail

cd "$(dirname "$0")/../.."

CONTAINER="${STAGING_CONTAINER:-ieee-dev-staging-web-1}"
DB="${STAGING_DB:-/home/drvij/ieee-staging-data/db/portal.db}"
BASE="${BASE:-https://staging.ieeesahrdaya.com}"

mint() {
  docker exec -i "$CONTAINER" node --experimental-sqlite - < scripts/audit/mint.cjs >/dev/null
}
cleanup() {
  docker exec -i "$CONTAINER" node --experimental-sqlite - < scripts/audit/cleanup.cjs 2>/dev/null || true
}

echo "==> mint fixtures (event + sessions)"
mint

echo "==> deep HTTP/API audit"
node scripts/audit/deep.mjs

# deep.mjs removes its own sessions at the end; mint again for the browser passes.
echo "==> mint sessions for the browser passes"
mint

echo "==> admin route sweep"
node scripts/audit/admin-sweep.mjs

echo "==> public UI, rails, mobile, theme"
node scripts/audit/ui.mjs

echo "==> accessibility + SEO (axe-core)"
node scripts/audit/a11y.mjs

echo "==> cleanup"
cleanup

echo "Staging audit complete. Evidence: /tmp/opencode/staging-audit/"
