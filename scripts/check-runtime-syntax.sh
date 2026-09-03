#!/usr/bin/env bash
set -euo pipefail

while IFS= read -r -d '' file; do
  node --check "$file" >/dev/null
done < <(find pb_hooks pb_migrations scripts -type f \( -name '*.js' -o -name '*.mjs' \) -print0)

while IFS= read -r -d '' file; do
  bash -n "$file"
done < <(find scripts -type f -name '*.sh' -print0)

echo "PocketBase/runtime script syntax checks passed."
