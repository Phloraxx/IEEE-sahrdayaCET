import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { pb } from '@/lib/pb'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LoadingSpinner } from '@/components/ui/loading'
import { QrCode, CheckCircle, XCircle, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'

export const Route = createFileRoute('/admin/check-in/$eventId')({
  component: CheckInPage,
})

function CheckInPage() {
  const { eventId } = Route.useParams()
  const [ticketId, setTicketId] = useState('')

  const { data: event, isLoading: eventLoading } = useQuery({
    queryKey: ['check-in-event', eventId],
    queryFn: async () => {
      const doc = await pb.collection('events').getOne(eventId)
      return doc
    },
  })

  const checkInMutation = useMutation({
    mutationFn: async (ticket: string) => {
      // Find registration by ticket ID
      const result = await pb.collection('registrations').getList(1, 1, {
        filter: `ticketId = "${ticket}" && event = "${eventId}"`,
      })

      if (result.items.length === 0) {
        throw new Error('Ticket not found')
      }

      const reg = result.items[0] as Record<string, unknown>
      const regId = reg.id as string

      if (reg.checkedIn) {
        throw new Error('Already checked in')
      }

      await pb.collection('registrations').update(regId, {
        checkedIn: true,
        checkedInAt: new Date().toISOString(),
      })

      return reg
    },
    onSuccess: () => {
      toast.success('Check-in successful')
      setTicketId('')
    },
    onError: (err) => {
      toast.error(String(err))
    },
  })

  if (eventLoading) return <LoadingSpinner />

  const e = event as Record<string, unknown>

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <a href={`/admin/events/${eventId}`}><ArrowLeft className="h-5 w-5" /></a>
        <div>
          <h2 className="text-2xl font-bold">Check-In</h2>
          <p className="text-sm text-muted-foreground">{e.title as string}</p>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex gap-2">
            <Input
              placeholder="Enter Ticket ID (e.g. TKT-abc123)"
              value={ticketId}
              onChange={(e) => setTicketId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && checkInMutation.mutate(ticketId)}
            />
            <Button
              onClick={() => checkInMutation.mutate(ticketId)}
              disabled={!ticketId || checkInMutation.isPending}
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Check In
            </Button>
          </div>

          {checkInMutation.isSuccess && (
            <div className="rounded-lg bg-green-50 p-4 text-green-700">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5" />
                <span className="font-semibold">Successfully checked in!</span>
              </div>
              <p className="mt-1 text-sm">
                Ticket: {ticketId}
              </p>
            </div>
          )}

          {checkInMutation.isError && (
            <div className="rounded-lg bg-red-50 p-4 text-red-700">
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5" />
                <span className="font-semibold">Check-in failed</span>
              </div>
              <p className="mt-1 text-sm">{String(checkInMutation.error)}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">Registered</p>
            <p className="mt-2 text-3xl font-bold">{(e.registeredCount as number) || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">Checked In</p>
            <p className="mt-2 text-3xl font-bold">{(e.checkedInCount as number) || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">Attendance %</p>
            <p className="mt-2 text-3xl font-bold">
              {e.registeredCount && (e.registeredCount as number) > 0
                ? Math.round(((e.checkedInCount as number) || 0) / (e.registeredCount as number) * 100)
                : 0}
              %
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
