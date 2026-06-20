import { createFileRoute } from '@tanstack/react-router'
import { serialize } from 'cookie'
import { PB_AUTH_COOKIE } from '@/lib/constants'

export const Route = createFileRoute('/api/auth/logout')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const isProduction = process.env.NODE_ENV === 'production'

        // Simple CSRF defense: require same-origin.
        const origin = request.headers.get('origin')
        const appUrl = process.env.NEXT_PUBLIC_APP_URL
        if (appUrl && origin && !origin.startsWith(appUrl)) {
          return Response.json({ error: 'Invalid origin' }, { status: 403 })
        }

        const response = Response.json({ success: true })
        response.headers.set(
          'Set-Cookie',
          serialize(PB_AUTH_COOKIE, '', {
            httpOnly: true,
            secure: isProduction,
            sameSite: 'lax',
            path: '/',
            maxAge: 0,
          }),
        )
        return response
      },
    },
  },
})
