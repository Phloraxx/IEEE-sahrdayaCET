import crypto from 'crypto'

/** Secret used to sign the OAuth provider cookie. */
function getSigningSecret(): string {
  const secret = process.env.OAUTH_COOKIE_SECRET
  if (secret) return secret
  // In production, fail closed — NEXT_PUBLIC_APP_URL is publicly known and
  // would let an attacker forge the OAuth state cookie (CSRF bypass).
  if (process.env.NODE_ENV === 'production') {
    throw new Error('OAUTH_COOKIE_SECRET must be set in production')
  }
  // Dev-only fallback. Uses the public app URL as a stable per-env secret so
  // the OAuth flow works locally without extra configuration.
  return process.env.NEXT_PUBLIC_APP_URL || 'dev-only-insecure-secret'
}

/** HMAC-signs a payload so it can't be tampered with via subdomain cookie injection. */
export function signCookie(payload: string): string {
  return crypto.createHmac('sha256', getSigningSecret()).update(payload).digest('base64url')
}

/** Verifies the signature and returns the parsed payload, or null if invalid. */
export function verifySignedCookie(signed: string): Record<string, unknown> | null {
  const sep = signed.lastIndexOf('.')
  if (sep < 1) return null
  const payload = signed.slice(0, sep)
  const signature = signed.slice(sep + 1)
  const expected = signCookie(payload)
  if (signature.length !== expected.length) return null
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null
  try {
    return JSON.parse(payload) as Record<string, unknown>
  } catch {
    return null
  }
}
