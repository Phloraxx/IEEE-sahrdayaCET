import { NextResponse } from 'next/server'

export async function POST() {
  const response = NextResponse.json({ success: true })
  response.cookies.set('pb_auth', '', { path: '/', maxAge: 0, httpOnly: false })
  return response
}
