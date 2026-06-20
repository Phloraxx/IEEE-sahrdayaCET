import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '@/hooks/useAuth'
import { pb } from '@/lib/pb'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Calendar, MapPin, IndianRupee, Users, ArrowLeft } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/loading'

export const Route = createFileRoute('/admin/events/$eventId')({
  component: EventDetailPage,
})

function EventDetailPage() {
  const { eventId } = Route.useParams()
  const { isAdmin, user } = useAuth()

  const { data: event, isLoading } = useQuery({
    queryKey: ['admin-event', eventId],
    queryFn: async () => {
      const doc = await pb.collection('events').getOne(eventId, { expand: 'society' })
      return doc
    },
    enabled: !!eventId,
  })

  if (isLoading) return <LoadingSpinner />
  if (!event) return (
    <div className="text-center">
      <h2 className="text-xl font-bold">Event not found</h2>
      <a href="/admin/events" className="mt-2 inline-block text-ieee-blue hover:underline">← Back</a>
    </div>
  )

  const e = event as Record<string, unknown>
  const expand = (e.expand as Record<string, unknown>) || {}
  const society = (expand.society as Record<string, unknown>) || {}

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <a href="/admin/events">
          <ArrowLeft className="h-5 w-5 text-muted-foreground hover:text-foreground" />
        </a>
        <h2 className="text-2xl font-bold">{e.title as string}</h2>
        <Badge variant={e.status === 'published' ? 'default' : 'outline'}>
          {e.status as string}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardContent className="space-y-4 p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm text-muted-foreground">Date & Time</label>
                  <p className="font-medium flex items-center gap-2 mt-1">
                    <Calendar className="h-4 w-4 text-ieee-blue" />
                    {new Date(e.date as string).toLocaleString()}
                  </p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Venue</label>
                  <p className="font-medium flex items-center gap-2 mt-1">
                    <MapPin className="h-4 w-4 text-ieee-blue" />
                    {e.venue as string}
                  </p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Price</label>
                  <p className="font-medium flex items-center gap-2 mt-1">
                    <IndianRupee className="h-4 w-4 text-ieee-blue" />
                    {(e.price as number) > 0 ? `₹${e.price}` : 'Free'}
                  </p>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">Society</label>
                  <p className="font-medium mt-1">{(society.name as string) || '-'}</p>
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Description</label>
                <p className="mt-1 text-sm text-foreground/80 whitespace-pre-wrap">{e.description as string}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardContent className="p-6 space-y-4">
              <h3 className="font-semibold">Registration Stats</h3>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Registered</span>
                <span className="font-medium flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  {(e.registeredCount as number) || 0}
                  {e.maxCapacity ? ` / ${e.maxCapacity}` : ''}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Checked In</span>
                <span className="font-medium">{(e.checkedInCount as number) || 0}</span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex gap-2">
                <a href={`/admin/events/${eventId}/edit`} className="flex-1">
                  <Button variant="outline" className="w-full">Edit</Button>
                </a>
                <a href={`/admin/check-in/${eventId}`}>
                  <Button variant="secondary">Check-In</Button>
                </a>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
