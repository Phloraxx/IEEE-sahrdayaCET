import { Suspense } from 'react'
import { createPB, createAdminPB } from '@/lib/pb'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { getChairSocietyIds } from '@/lib/chair-scope'

async function RegistrationDetail({ id }: { id: string }) {
  const cookieStore = await cookies()
  const pb = createPB(`pb_auth=${cookieStore.get('pb_auth')?.value}`)
  const adminPB = createAdminPB()

  try {
    // Authenticate and get user role
    await pb.collection('users').authRefresh()
    const record = pb.authStore.record as { id: string; role: string } | null
    const userId = record?.id || ''
    const userRole = record?.role || ''

    const reg = await adminPB.collection('registrations').getOne(id, { expand: 'event' })
    const expand = (reg as Record<string, unknown>).expand as Record<string, unknown> | undefined
    const event = expand?.event as Record<string, unknown> | undefined
    const r = reg as Record<string, unknown>

    // Chair access check: verify the registration's event belongs to the chair's society
    if (userRole === 'chair' && userId) {
      // Use the expanded event's society field (not r.event, which is the event UUID)
      const eventSocietyId = event?.society as string | undefined
      if (eventSocietyId) {
        const societyIds = await getChairSocietyIds(adminPB, userId)
        if (!societyIds.includes(eventSocietyId)) {
          return <div className="p-12 text-center text-sm text-muted-foreground">You don't have access to this registration.</div>
        }
      } else {
        return <div className="p-12 text-center text-sm text-muted-foreground">Registration has no associated event.</div>
      }
    }

    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="card-hover">
          <CardHeader><CardTitle className="text-base">User Info</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{r.userName as string}</span></div>
            <div><span className="text-muted-foreground">Email:</span> {r.userEmail as string}</div>
            <div><span className="text-muted-foreground">Phone:</span> {(r.userPhone as string) || '—'}</div>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardHeader><CardTitle className="text-base">Event</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div><span className="text-muted-foreground">Title:</span> {event?.title as string || '—'}</div>
            <div><span className="text-muted-foreground">Date:</span> {event?.date ? new Date(event.date as string).toLocaleDateString('en-IN') : '—'}</div>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardHeader><CardTitle className="text-base">Status</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Registration:</span> <Badge className="text-[10px] px-1.5 py-0">{(r.registrationStatus as string) || 'pending'}</Badge></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Payment:</span> <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{(r.paymentStatus as string) || '—'}</Badge></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Checked In:</span> <span>{(r.checkedIn as boolean) ? 'Yes' : 'No'}</span></div>
          </CardContent>
        </Card>
        <Card className="card-hover">
          <CardHeader><CardTitle className="text-base">Ticket</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div><span className="text-muted-foreground">Ticket ID:</span> <span className="font-mono text-xs">{(r.ticketId as string) || '—'}</span></div>
            <div><span className="text-muted-foreground">Amount:</span> <span className="font-mono">₹{Number(r.amount) || 0}</span></div>
          </CardContent>
        </Card>
      </div>
    )
  } catch {
    return <div className="p-12 text-center text-sm text-muted-foreground">Registration not found.</div>
  }
}

function RegDetailSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card p-6 space-y-3">
          <div className="animate-shimmer rounded-md h-5 w-24" />
          <div className="animate-shimmer rounded-md h-4 w-32" />
          <div className="animate-shimmer rounded-md h-4 w-48" />
          <div className="animate-shimmer rounded-md h-4 w-40" />
        </div>
      ))}
    </div>
  )
}

export default async function RegistrationDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <Link href="/admin/registrations" className="inline-flex items-center justify-center rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted transition-colors">
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Registration</h1>
          <p className="text-sm text-muted-foreground mt-1">Registration details</p>
        </div>
      </div>

      <Suspense fallback={<RegDetailSkeleton />}>
        <RegistrationDetail id={id} />
      </Suspense>
    </div>
  )
}
