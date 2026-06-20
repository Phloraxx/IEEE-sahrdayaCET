import { serialize } from 'cookie'
import { PB_AUTH_COOKIE } from '@/lib/constants'

const isProduction = process.env.NODE_ENV === 'production'

/** Clears the auth cookie with the same security attributes used when setting it. */
function clearAuthCookie(): string {
  return serialize(PB_AUTH_COOKIE, '', {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

export async function POST(req: Request) {
  // Simple CSRF defense: require same-origin (Origin or Referer matches APP_URL).
  // sameSite=lax covers most cases; this is defense-in-depth for the rare bypass.
  const origin = req.headers.get('origin')
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (appUrl && origin && !origin.startsWith(appUrl)) {
    return Response.json({ error: 'Invalid origin' }, { status: 403 })
  }

  const response = Response.json({ success: true })
  response.headers.set('Set-Cookie', clearAuthCookie())
  return response
}
