# ───────────────────────────────────────────────────────────────
#  IEEE Sahrdaya — Multi-stage Docker build (bun runtime)
#  Base:        node:22-alpine + bun
#  Output:      Next.js standalone (runs via node server.js)
# ───────────────────────────────────────────────────────────────

FROM node:22-alpine AS base
ENV NEXT_TELEMETRY_DISABLED=1

# Install bun for faster dependency installs
RUN npm install -g bun@latest

# Install dependencies when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json ./
RUN --mount=type=cache,id=bun-cache,target=/root/.bun/install/cache \
    bun install

# Build the app
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN --mount=type=cache,id=next-cache,target=/app/.next/cache \
    bun run build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000 || exit 1

CMD ["node", "server.js"]
