#!/usr/bin/env bash
set -euo pipefail

# 124 files, so check them in parallel: sequentially this step was one of the
# slower parts of the fast path.
find pb_hooks pb_migrations scripts -type f \( -name '*.js' -o -name '*.mjs' \) -print0 \
  | xargs -0 -P 8 -n 1 node --check

while IFS= read -r -d '' file; do
  bash -n "$file"
done < <(find scripts -type f -name '*.sh' -print0)

node scripts/generate-academic-options.mjs --check

echo "PocketBase/runtime script syntax checks passed."
