import { NextRequest, NextResponse } from 'next/server'
import PocketBase from 'pocketbase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const providerCookie = req.cookies.get('pb_oauth_provider')?.value

  if (!code || !state || !providerCookie) {
    return NextResponse.redirect(new URL('/auth/login?error=invalid_request', req.url))
  }

  const provider = JSON.parse(providerCookie)
  if (provider.state !== state) {
    return NextResponse.redirect(new URL('/auth/login?error=state_mismatch', req.url))
  }

  const redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/google`

  try {
    const url = process.env.POCKETBASE_URL
    if (!url) throw new Error('Missing POCKETBASE_URL')
    const pb = new PocketBase(url)
    await pb.collection('users').authWithOAuth2Code(
      provider.name,
      code,
      provider.codeVerifier,
      redirectUrl,
    )

    const response = NextResponse.redirect(new URL('/', req.url))
    const cookie = pb.authStore.exportToCookie({ httpOnly: true })
    response.headers.set('Set-Cookie', cookie)

    return response
  } catch (err) {
    console.error('OAuth callback error:', err)
    return NextResponse.redirect(new URL('/auth/login?error=auth_failed', req.url))
  }
}
