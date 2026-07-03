// ─── In-memory sliding-window rate limiter ─────────────────────────
// Single-instance fine (single container per docker-compose.yml).
// Key by user.id when authed, else by IP.

interface Bucket {
  tokens: number
  lastRefill: number
}

const buckets = new Map<string, Bucket>()

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of buckets) {
    if (now - bucket.lastRefill > 300_000) {
      buckets.delete(key)
    }
  }
}, 300_000)

export interface RateLimitConfig {
  key: string
  max: number
  windowMs: number
}

export function checkRateLimit(config: RateLimitConfig): { allowed: boolean; retryAfterMs: number } {
  const { key, max, windowMs } = config
  const now = Date.now()

  let bucket = buckets.get(key)
  if (!bucket) {
    bucket = { tokens: max - 1, lastRefill: now }
    buckets.set(key, bucket)
    return { allowed: true, retryAfterMs: 0 }
  }

  // Refill tokens based on elapsed time
  const elapsed = now - bucket.lastRefill
  const refillCount = Math.floor(elapsed / windowMs * max)
  if (refillCount > 0) {
    bucket.tokens = Math.min(max, bucket.tokens + refillCount)
    bucket.lastRefill = now
  }

  if (bucket.tokens <= 0) {
    const retryAfterMs = windowMs - (now - bucket.lastRefill)
    return { allowed: false, retryAfterMs: Math.max(0, retryAfterMs) }
  }

  bucket.tokens--
  return { allowed: true, retryAfterMs: 0 }
}

export function rateLimitResponse(retryAfterMs: number): Response {
  const retryAfterSec = Math.ceil(retryAfterMs / 1000)
  return Response.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSec),
        "X-RateLimit-RetryAfter": String(retryAfterSec),
      },
    },
  )
}
