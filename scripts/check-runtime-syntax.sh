#!/usr/bin/env bash
set -euo pipefail

# 124 files, so check them in parallel: sequentially this step was one of the
# slower parts of the fast path.
#
# pb_hooks/ and pb_migrations/ are PocketBase history, not application code, but
# they are still checked: a syntax error there would break the rollback image and
# the migration rehearsal, and the check costs a few hundred milliseconds. They
# leave normal CI with the rest of the PocketBase tooling (see
# docs/legacy-tooling.md) only if this step becomes slow or noisy.
LEGACY_DIRS=()
for dir in pb_hooks pb_migrations; do
  [ -d "$dir" ] && LEGACY_DIRS+=("$dir")
done

if [ ${#LEGACY_DIRS[@]} -gt 0 ]; then
  find "${LEGACY_DIRS[@]}" -type f \( -name '*.js' -o -name '*.mjs' \) -print0 \
    | xargs -0 -P 8 -n 1 node --check
fi

# The live scripts: the migration, audit harness, release-gate runners.
find scripts tests/ci -type f \( -name '*.js' -o -name '*.mjs' \) -print0 \
  | xargs -0 -P 8 -n 1 node --check

while IFS= read -r -d '' file; do
  bash -n "$file"
done < <(find scripts -type f -name '*.sh' -print0)

node scripts/generate-academic-options.mjs --check

echo "Runtime script syntax checks passed (legacy PocketBase hooks included)."
