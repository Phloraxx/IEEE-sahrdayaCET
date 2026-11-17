# syntax=docker/dockerfile:1.7
FROM oven/bun:1.2.9-alpine AS deps
WORKDIR /app
# better-sqlite3 has no bun prebuild path and compiles from source, so the
# install stages need the native toolchain (node-gyp requires python3, make, g++).
RUN apk add --no-cache python3 make g++
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS build
COPY . .
RUN bun run build

FROM oven/bun:1.2.9-alpine AS prod-deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM node:22-alpine AS runtime
RUN apk add --no-cache font-noto
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
