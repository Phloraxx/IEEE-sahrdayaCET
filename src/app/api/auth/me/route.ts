import { NextResponse } from 'next/server'
import { createPB } from '@/lib/pb'

export async function GET(req: Request) {
  const pb = createPB(req.headers.get('cookie') || undefined)
  if (!pb.authStore.isValid) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }
  try {
    await pb.collection('users').authRefresh()
  } catch {
    return NextResponse.json({ error: 'Session expired' }, { status: 401 })
  }
  const record = pb.authStore.record as { id: string; email?: string; name?: string; role?: string }
  return NextResponse.json({
    user: { id: record.id, email: record.email, name: record.name, role: record.role },
  })
}
