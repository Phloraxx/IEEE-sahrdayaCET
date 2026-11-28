# syntax=docker/dockerfile:1.7
#
# Provenance args. CI's `web-image` job passes GIT_COMMIT and GIT_TREE; CD reads
# `GIT_TREE` back from build/build-info.json to prove the image it deploys was
# built from the tree CI tested. Declared in every stage where they are consumed
# so `docker build` with the args never fails for an undeclared ARG, and defaulted
# so a plain `docker compose build` on a laptop still works (no provenance baked).
# Bun 1.2.9's better-sqlite3 postinstall never returns under BuildKit on
# linux/arm64 (it completes with the legacy builder, and 1.4.x completes under
# BuildKit in ~25 s). Keep this pinned at a version that builds.
FROM oven/bun:1.4.5-alpine AS deps
WORKDIR /app
# better-sqlite3 has no bun prebuild path and compiles from source, so the
# install stages need the native toolchain (node-gyp requires python3, make, g++).
RUN apk add --no-cache python3 make g++
COPY package.json bun.lock ./
# Keep the registry cache across builds: a lockfile change then costs an
# install, not a re-download. Requires BuildKit; Dokploy builds with it.
RUN --mount=type=cache,id=bun-cache,target=/root/.bun/install/cache,sharing=locked \
    bun install --frozen-lockfile

FROM deps AS build
COPY . .
# Build identity, baked in rather than read at runtime. The runtime image below
# has no `.git`, and a deploy host's checkout is not the build's checkout, so
# the only trustworthy source is what the caller hands this stage.
#   GIT_COMMIT  the commit being built (CI passes $GITHUB_SHA; see deploy-local.sh)
#   GIT_TREE    its git tree (CI resolves it; a merge commit keeps the tested tree)
#   GIT_BUILT_AT  ISO timestamp, for an operator reading /admin/data-health
#
# Two readers exist and both must be satisfied. The Vite build writes
# `build/build-info.json` from these environment variables, and
# `resolveBuildIdentity()` falls back to the baked `build/git-*` files when the
# runtime environment does not carry them. A plain `docker build .` with no args
# produces an image that reports `source` instead of a commit, and every consumer
# says so rather than guessing.
ARG GIT_COMMIT=""
ARG GIT_TREE=""
ARG GIT_BUILT_AT=""
ENV GIT_COMMIT=$GIT_COMMIT \
    GIT_TREE=$GIT_TREE \
    GIT_BUILT_AT=$GIT_BUILT_AT
RUN bun run build \
    && printf '%s\n' "$GIT_COMMIT" > build/git-commit \
    && printf '%s\n' "$GIT_TREE" > build/git-tree \
    && printf '%s\n' "$GIT_BUILT_AT" > build/git-built-at

FROM oven/bun:1.4.5-alpine AS prod-deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json bun.lock ./
# The server never imports TypeScript, and the runtime is Linux/arm64-musl:
# the other prebuilt sqlite/sharp binaries are dead weight in the image.
RUN --mount=type=cache,id=bun-cache,target=/root/.bun/install/cache,sharing=locked \
    bun install --frozen-lockfile --production \
    && rm -rf /app/node_modules/typescript /app/node_modules/@types \
    && if [ "$(uname -m)" = "aarch64" ]; then \
         rm -rf /app/node_modules/@img/sharp-linux-arm64 /app/node_modules/@img/sharp-libvips-linux-arm64; \
         find /app/node_modules/better-sqlite3/prebuilds -type f ! -name 'linuxmusl-arm64.node' -delete; \
       fi

FROM node:22-alpine AS runtime
# Certificates only reference Noto Sans/Serif Regular (see render.server.ts).
# The font-noto metapackage ships every script; keeping the two files the
# renderer opens removes ~15 MB from the runtime image.
RUN apk add --no-cache font-noto \
    && find /usr/share/fonts -type f ! -name 'NotoSans-Regular.ttf' ! -name 'NotoSerif-Regular.ttf' -delete
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
# db.server.ts reads sqlite/schema.sql at boot (schema ensure/migrate path).
COPY sqlite/ ./sqlite/
COPY package.json ./package.json
EXPOSE 3000
USER node
# Inspect a running deployment without opening its data:
#   docker exec <container> cat /app/build/git-commit
CMD ["node", "./node_modules/@react-router/serve/bin.js", "./build/server/index.js"]
