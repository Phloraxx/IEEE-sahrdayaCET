import { serialize } from 'cookie'
import PocketBase from 'pocketbase'
import { handleError } from '@/lib/api-error'
import { signCookie } from '@/lib/cookie-signing'
import { PB_OAUTH_PROVIDER_COOKIE, OAUTH_CALLBACK_PATH } from '@/lib/constants'

export async function GET() {
  try {
    const url = process.env.POCKETBASE_URL
    if (!url) return Response.json({ error: 'Server configuration error' }, { status: 500 })
    const pb = new PocketBase(url)
    const authMethods = await pb.collection('users').listAuthMethods()
    const provider = authMethods.oauth2.providers.find((p) => p.name === 'google')

    if (!provider) {
      return Response.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL}${OAUTH_CALLBACK_PATH}`
    const fullAuthURL = `${provider.authURL}${redirectUrl}`

    const payload = JSON.stringify({
      name: provider.name,
      codeVerifier: provider.codeVerifier,
      state: provider.state,
    })
    const signedCookie = `${payload}.${signCookie(payload)}`

    const response = Response.json({ authURL: fullAuthURL })
    response.headers.set(
      'Set-Cookie',
      serialize(PB_OAUTH_PROVIDER_COOKIE, signedCookie, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 300,
      }),
    )

    return response
  } catch (error) {
    return handleError(error, 'auth-init')
  }
}
