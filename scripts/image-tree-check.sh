#!/usr/bin/env bash
# The CI job's "is this tree already published?" decision, executable on its
# own so it can be exercised against a real registry. The workflow runs the
# same steps; keep them in sync.
#
#   scripts/image-tree-check.sh <image> <tree>
#
# Prints `exists=true` or `exists=false` to stdout, the same value the job
# writes to $GITHUB_OUTPUT. Probes the *structured registry manifest*
# (`imagetools inspect --format '{{json .Image}}'`), never parsed human output,
# and refuses to trust anything without the full provenance contract — so an
# image published before GIT_COMMIT/GIT_TREE existed is rebuilt, not reused.
set -euo pipefail

IMAGE="${1:?image}"
TREE="${2:?tree}"
# Bump when the image contract changes (build args, labels, how they are baked).
IMAGE_CONTRACT="${IMAGE_CONTRACT:-2}"

if [ -z "$TREE" ]; then
	echo "exists=false"
	exit 0
fi

tag="$IMAGE:tree-$TREE"
if ! docker buildx imagetools inspect "$tag" >/dev/null 2>&1; then
	echo "No image for $tag; building." >&2
	echo "exists=false"
	exit 0
fi

# The manifest's image config carries the labels. `.Image` is the platform
# image (for an index, the one matching the runner's platform, linux/arm64 in
# CI); `--raw` on an index has no `.config` at all, which is why the structured
# form is used.
labels_json="$(docker buildx imagetools inspect "$tag" --format '{{json .Image}}' 2>/dev/null || echo '{}')"
tree_label="$(printf '%s' "$labels_json" | jq -r '.config.Labels["ieee.tree"] // empty')"
revision_label="$(printf '%s' "$labels_json" | jq -r '.config.Labels["org.opencontainers.image.revision"] // empty')"
contract_label="$(printf '%s' "$labels_json" | jq -r '.config.Labels["ieee.image-contract"] // empty')"

if [ "$tree_label" = "$TREE" ] && [ -n "$revision_label" ] && [ "$contract_label" = "$IMAGE_CONTRACT" ]; then
	echo "Image for $tag is published and verifiable; skipping the build." >&2
	echo "exists=true"
else
	echo "Image for $tag does not carry the provenance contract (tree='$tree_label' revision='$revision_label' contract='$contract_label'); rebuilding." >&2
	echo "exists=false"
fi
