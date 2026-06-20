import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect } from 'react'
import { pb } from '@/lib/pb'

export const Route = createFileRoute('/auth/callback')({
  component: AuthCallbackPage,
})

/**
 * PocketBase OAuth2 Popup Callback Handler
 *
 * When authWithOAuth2 is called, PB opens a popup that redirects to
 * PB's built-in redirect URL (/api/oauth2-redirect). The popup then
 * sends the auth token back to the parent window via postMessage.
 *
 * This route exists as a fallback for redirect-based OAuth flows.
 * In most cases the popup handles everything and this page is never visited.
 */
function AuthCallbackPage() {
  useEffect(() => {
    // If we land here with a code in the URL, try to exchange it manually
    const search = new URLSearchParams(window.location.search)
    const code = search.get('code')
    const state = search.get('state')

    if (code && state) {
      // This should not normally be reached with the popup flow,
      // but handle it gracefully
      console.log('OAuth callback received:', { code, state })
    }

    // Redirect to home after a brief delay
    const timer = setTimeout(() => {
      window.location.href = '/'
    }, 2000)

    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-ieee-blue border-t-transparent" />
        <p className="text-muted-foreground">Completing sign in...</p>
      </div>
    </div>
  )
}
