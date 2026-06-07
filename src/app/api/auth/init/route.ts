import { NextRequest, NextResponse } from 'next/server'
import PocketBase from 'pocketbase'

export async function GET(_req: NextRequest) {
  const url = process.env.POCKETBASE_URL
  if (!url) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  const pb = new PocketBase(url)
  const authMethods = await pb.collection('users').listAuthMethods()
  const provider = authMethods.oauth2.providers.find((p) => p.name === 'google')

  if (!provider) {
    return NextResponse.json({ error: 'Google OAuth provider not configured' }, { status: 500 })
  }

  const redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/google`
  const fullAuthURL = `${provider.authURL}${redirectUrl}`

  const response = NextResponse.json({ authURL: fullAuthURL })

  response.cookies.set('pb_oauth_provider', JSON.stringify({
    name: provider.name,
    codeVerifier: provider.codeVerifier,
    state: provider.state,
  }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 300,
  })

  return response
}
