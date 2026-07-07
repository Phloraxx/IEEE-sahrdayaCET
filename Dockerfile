# ───────────────────────────────────────────────────────────────
#  IEEE Sahrdaya — Multi-stage Docker build (bun runtime)
#  Base:        node:22-alpine + bun
#  Output:      TanStack Start (runs via server-entry.mjs)
#
#  Layer-caching strategy:
#    deps   — package.json + bun.lock → bun install (cached via BuildKit)
#    build  — full source → bun run build
#    runner — dist only + node_modules (no build tooling)
# ───────────────────────────────────────────────────────────────

# ═══════════════════════════════════════════════════════════════
# Bun installer — downloads the correct platform binary directly.
# npm's bun shim fails on arm64/aarch64 because the optional dependency
# is not exposed by npm install, so we fetch the GitHub release instead.
# ═══════════════════════════════════════════════════════════════
FROM node:22-alpine AS bun-installer
ARG BUN_VERSION=1.2.9
ARG TARGETARCH
RUN apk add --no-cache curl unzip bash
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
RUN set -eux; \
    case "$TARGETARCH" in \
    amd64) BUN_ARCH=x64 ;; \
    arm64|aarch64) BUN_ARCH=aarch64 ;; \
    *) echo "Unsupported architecture: $TARGETARCH"; exit 1 ;; \
    esac; \
    curl -fsSL "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-${BUN_ARCH}-musl.zip" -o /tmp/bun.zip; \
    unzip -o /tmp/bun.zip -d /tmp; \
    mv "/tmp/bun-linux-${BUN_ARCH}-musl/bun" /usr/local/bin/bun; \
    chmod +x /usr/local/bin/bun; \
    bun --version

# ─── Base ──────────────────────────────────────────────────────
FROM node:22-alpine AS base
ENV TANSTACK_START_TELEMETRY_DISABLED=1
COPY --from=bun-installer /usr/local/bin/bun /usr/local/bin/bun

# ─── Dependencies ──────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat

COPY package.json bun.lock ./
RUN \
    bun install

# ─── Build ─────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# No --mount=type=cache for .tanstack/tmp — TanStack Router generator
# uses rename() which fails across filesystem boundaries (EXDEV).
# Remove stale .tanstack cache to force a fresh route tree generation.
RUN rm -rf .tanstack
RUN bun run build

# Verify the generated route tree includes all FIFA API routes.
# If any are missing, the build fails — prevents deploying a broken
# preview that 404s on half the endpoints.
RUN node -e "const t=require('./src/routeTree.gen.ts'); " 2>/dev/null || \
    grep -q 'api/fifa/matches' src/routeTree.gen.ts && \
    grep -q 'api/fifa/dashboard' src/routeTree.gen.ts && \
    grep -q 'api/admin/fifa/matches' src/routeTree.gen.ts && \
    grep -q 'api/admin/fifa/settings' src/routeTree.gen.ts && \
    echo "route tree OK" || \
    (echo "ERROR: route tree missing FIFA routes" && exit 1)

# ─── Fix TanStack Start singleton getRouter() bug (#6924) ─────────
# The built router bundle caches a singleton getRouter() that leaks
# request-scoped state (including redirect) across SSR requests.
# Patch it to return a fresh router per call instead of the cached singleton.
RUN for f in /app/dist/server/assets/router-*.js; do \
      sed -i '/function getRouter/,/^}/c\function getRouter() { return createRouter({routeTree,scrollRestoration:true,trailingSlash:"preserve"}); }' "$f"; \
    done

# ─── Production Runner ─────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV TANSTACK_START_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 ieeeapp

COPY --from=builder /app/dist          ./dist
COPY --from=builder /app/public        ./public
COPY --from=builder /app/package.json  ./
COPY --from=builder /app/node_modules  ./node_modules
COPY server-entry.mjs ./

RUN mkdir -p /app/data && chown -R ieeeapp:nodejs /app/data

USER ieeeapp

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server-entry.mjs"]
