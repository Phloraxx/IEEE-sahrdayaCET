import { serialize } from 'cookie'
import PocketBase from 'pocketbase'

export async function GET() {
  const url = process.env.POCKETBASE_URL
  if (!url) return Response.json({ error: 'Server misconfigured' }, { status: 500 })
  const pb = new PocketBase(url)
  const authMethods = await pb.collection('users').listAuthMethods()
  const provider = authMethods.oauth2.providers.find((p) => p.name === 'google')

  if (!provider) {
    return Response.json({ error: 'Google OAuth provider not configured' }, { status: 500 })
  }

  const redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/google`
  const fullAuthURL = `${provider.authURL}${redirectUrl}`

  const response = Response.json({ authURL: fullAuthURL })
  response.headers.set(
    'Set-Cookie',
    serialize('pb_oauth_provider', JSON.stringify({
      name: provider.name,
      codeVerifier: provider.codeVerifier,
      state: provider.state,
    }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 300,
    }),
  )

  return response
}
