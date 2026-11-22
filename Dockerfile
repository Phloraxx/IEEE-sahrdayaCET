# syntax=docker/dockerfile:1.7
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
RUN bun run build

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
CMD ["node", "./node_modules/@react-router/serve/bin.js", "./build/server/index.js"]
