import { serialize } from 'cookie'

export async function POST() {
  const response = Response.json({ success: true })
  response.headers.set(
    'Set-Cookie',
    serialize('pb_auth', '', { path: '/', maxAge: 0 }),
  )
  return response
}
