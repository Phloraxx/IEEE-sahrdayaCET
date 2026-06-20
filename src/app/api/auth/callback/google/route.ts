import { NextRequest, NextResponse } from 'next/server'
import { serialize } from 'cookie'
import PocketBase from 'pocketbase'
import { logError } from '@/lib/logger'
import { verifySignedCookie } from '@/lib/cookie-signing'
import { PB_OAUTH_PROVIDER_COOKIE, OAUTH_CALLBACK_PATH } from '@/lib/constants'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const providerCookie = req.cookies.get(PB_OAUTH_PROVIDER_COOKIE)?.value

  if (!code || !state || !providerCookie) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  const provider = verifySignedCookie(providerCookie)
  if (!provider || provider.state !== state) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  const redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL}${OAUTH_CALLBACK_PATH}`

  try {
    const url = process.env.POCKETBASE_URL
    if (!url) throw new Error('Missing POCKETBASE_URL')
    const pb = new PocketBase(url)
    await pb.collection('users').authWithOAuth2Code(
      provider.name as string,
      code,
      provider.codeVerifier as string,
      redirectUrl,
    )

    const response = NextResponse.redirect(new URL('/', req.url))

    // Set the auth cookie
    const authCookie = pb.authStore.exportToCookie({
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    })
    response.headers.set('Set-Cookie', authCookie)

    // Clear the one-time OAuth provider cookie (PKCE verifier must not be reusable)
    response.headers.append(
      'Set-Cookie',
      serialize(PB_OAUTH_PROVIDER_COOKIE, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
      }),
    )

    return response
  } catch (err) {
    logError('oauth-callback', err)
    // Still clear the provider cookie on failure
    const response = NextResponse.redirect(new URL('/', req.url))
    response.headers.set(
      'Set-Cookie',
      serialize(PB_OAUTH_PROVIDER_COOKIE, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
      }),
    )
    return response
  }
}

// (OAuth provider cookie is cleared above; auth cookie set by exportToCookie)
