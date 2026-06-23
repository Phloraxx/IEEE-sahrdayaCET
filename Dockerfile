# ───────────────────────────────────────────────────────────────
#  IEEE Sahrdaya — Multi-stage Docker build (bun runtime)
#  Base:        node:22-alpine + bun
#  Output:      TanStack Start (runs via node dist/server/server.js)
#
#  Layer-caching strategy:
#    deps   — package.json + bun.lock → bun install (cached via BuildKit)
#    build  — full source → bun run build
#    runner — dist only + node_modules (no build tooling)
# ───────────────────────────────────────────────────────────────

FROM node:22-alpine AS base
ENV TANSTACK_START_TELEMETRY_DISABLED=1
RUN npm install -g bun@latest

# ─── Dependencies ──────────────────────────────────────────────
FROM base AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat

# Copy lock files first — this layer is cached until bun.lock changes
COPY package.json bun.lock ./
RUN --mount=type=cache,id=bun-cache,target=/root/.bun/install/cache \
    bun install
# ─── Build ─────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

# Copy deps first (cached layer)
COPY --from=deps /app/node_modules ./node_modules

# Copy source (invalidates cache on any src change)
COPY . .

# Build the app
# Note: No --mount=type=cache for .tanstack/tmp — TanStack Router generator
# uses rename() which fails across filesystem boundaries (EXDEV).
RUN bun run build

# ─── Production Runner ─────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV TANSTACK_START_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 ieeeapp

# Copy only what's needed to run
COPY --from=builder /app/dist          ./dist
COPY --from=builder /app/public        ./public
COPY --from=builder /app/package.json  ./
COPY --from=builder /app/node_modules  ./node_modules

# Data directory for writable files
RUN mkdir -p /app/data && chown -R ieeeapp:nodejs /app/data

USER ieeeapp

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Start the TanStack Start server
CMD ["node", "dist/server/server.js"]
