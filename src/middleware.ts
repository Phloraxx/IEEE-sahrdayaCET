import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import PocketBase from 'pocketbase'

export async function middleware(req: NextRequest) {
  const authCookie = req.cookies.get('pb_auth')?.value

  if (req.nextUrl.pathname.startsWith('/admin')) {
    if (!authCookie) {
      return NextResponse.redirect(new URL('/auth/login', req.url))
    }

    try {
      const url = process.env.POCKETBASE_URL
      if (!url) throw new Error('Missing POCKETBASE_URL')
      const pb = new PocketBase(url)
      pb.authStore.loadFromCookie(`pb_auth=${authCookie}`, 'pb_auth')

      if (!pb.authStore.isValid) {
        return NextResponse.redirect(new URL('/auth/login', req.url))
      }

      const authData = await pb.collection('users').authRefresh()
      const user = authData.record as { role?: string }

      if (user.role !== 'admin') {
        return NextResponse.redirect(new URL('/', req.url))
      }
    } catch {
      return NextResponse.redirect(new URL('/auth/login', req.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*'],
}
