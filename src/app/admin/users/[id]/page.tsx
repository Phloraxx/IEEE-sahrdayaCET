import { createPB, escapeFilterValue } from '@/lib/pb'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default async function UserDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const cookieStore = await cookies()
  const pb = createPB(`pb_auth=${cookieStore.get('pb_auth')?.value}`)

  try {
    const user = await pb.collection('users').getOne(id)
    const u = user as Record<string, unknown>

    let regs: { items: Record<string, unknown>[]; totalItems: number } = { items: [], totalItems: 0 }
    try {
      regs = await pb.collection('registrations').getList(1, 20, {
        filter: `user = ${escapeFilterValue(id)}`,
        sort: '-created',
        expand: 'event',
        fields: 'id,userName,registrationStatus,paymentStatus,created,expand',
      }) as unknown as { items: Record<string, unknown>[]; totalItems: number }
    } catch {
      // Registrations fetch is non-fatal
    }

    return (
      <div className="space-y-6 max-w-2xl">
        <div className="flex items-center gap-4">
          <Link href="/admin/users" className="inline-flex items-center justify-center rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted transition-colors">
            <ArrowLeft className="size-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{(u.name as string) || 'User'}</h1>
            <p className="text-sm text-muted-foreground mt-1">{u.email as string}</p>
          </div>
        </div>

        <Card className="card-hover">
          <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Name:</span> <span className="font-medium">{(u.name as string) || '—'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Email:</span> {u.email as string}</div>
            <div className="flex justify-between"><span className="text-muted-foreground">Role:</span> <Badge>{(u.role as string) || 'user'}</Badge></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Registrations:</span> {regs.totalItems}</div>
          </CardContent>
        </Card>

        {regs.items.length > 0 && (
          <Card className="card-hover">
            <CardHeader><CardTitle className="text-base">Registrations</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {regs.items.map((r: Record<string, unknown>) => {
                const ex = r.expand as Record<string, unknown> | undefined
                const ev = ex?.event as Record<string, unknown> | undefined
                return (
                  <div key={r.id as string} className="flex items-center justify-between border-b border-border/30 pb-2 last:border-0">
                    <span className="text-sm">{ev?.title as string || '—'}</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{(r.registrationStatus as string) || 'pending'}</Badge>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}
      </div>
    )
  } catch {
    return <div className="p-12 text-center text-sm text-muted-foreground">User not found.</div>
  }
}
