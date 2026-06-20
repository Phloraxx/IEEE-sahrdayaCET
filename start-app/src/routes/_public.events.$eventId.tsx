import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { pb } from '@/lib/pb'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Calendar, MapPin, IndianRupee, Users, ArrowLeft } from 'lucide-react'

export const Route = createFileRoute('/_public/events/$eventId')({
  component: EventDetailPage,
})

function EventDetailPage() {
  const { eventId } = Route.useParams()

  const { data: event, isLoading } = useQuery({
    queryKey: ['event', eventId],
    queryFn: async () => {
      const doc = await pb.collection('events').getOne(eventId, {
        expand: 'society',
      })
      return doc
    },
  })

  if (isLoading) {
    return (
      <div className="container mx-auto px-6 py-16">
        <div className="flex items-center justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-ieee-blue border-t-transparent" />
        </div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="container mx-auto px-6 py-16 text-center">
        <h1 className="text-2xl font-bold">Event not found</h1>
        <a href="/events" className="mt-4 inline-block text-ieee-blue hover:underline">
          ← Back to events
        </a>
      </div>
    )
  }

  const e = event as Record<string, unknown>
  const title = e.title as string
  const description = e.description as string
  const date = e.date as string
  const endDate = e.endDate as string | undefined
  const venue = e.venue as string
  const price = (e.price as number) || 0
  const status = e.status as string
  const maxCapacity = e.maxCapacity as number
  const registeredCount = (e.registeredCount as number) || 0
  const registrationOpen = !!e.registrationOpen
  const checkInEnabled = !!e.checkInEnabled
  const collectIeeeMember = !!e.collectIeeeMember
  const tags = e.tags as string
  const expand = (e.expand as Record<string, unknown>) || {}
  const society = (expand.society as Record<string, unknown>) || {}
  const societyName = (society.name as string) || 'General'

  return (
    <div className="container mx-auto px-6 py-16">
      <a href="/events" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to events
      </a>

      <div className="mt-6 grid gap-8 lg:grid-cols-3">
        {/* Main content */}
        <div className="lg:col-span-2">
          <div className="flex items-center gap-3">
            <Badge variant="outline">{societyName}</Badge>
            <StatusBadge status={status} />
          </div>
          <h1 className="mt-4 text-3xl font-bold">{title}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {new Date(date).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
              {endDate && ` - ${new Date(endDate).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
            </span>
            <span className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              {venue}
            </span>
          </div>

          <div className="mt-8 prose max-w-none">
            <p className="whitespace-pre-wrap text-foreground/80">{description}</p>
          </div>

          {tags && (
            <div className="mt-6 flex flex-wrap gap-2">
              {tags.split(',').map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag.trim()}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Status</span>
                <StatusBadge status={status} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Price</span>
                <span className="font-semibold">
                  {price > 0 ? (
                    <span className="flex items-center gap-1"><IndianRupee className="h-3 w-3" />{price}</span>
                  ) : (
                    'Free'
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Capacity</span>
                <span className="flex items-center gap-1 text-sm">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  {registeredCount}
                  {maxCapacity ? ` / ${maxCapacity}` : ' registered'}
                </span>
              </div>
              {maxCapacity && registeredCount >= maxCapacity && (
                <Badge variant="destructive">Full</Badge>
              )}

              {registrationOpen ? (
                <Button className="w-full">Register Now</Button>
              ) : (
                <Button disabled className="w-full">Registration Closed</Button>
              )}
            </CardContent>
          </Card>

          {checkInEnabled && (
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold">Check-In Available</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Present your ticket QR code at the venue.
                </p>
              </CardContent>
            </Card>
          )}

          {collectIeeeMember && (
            <Card>
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground">
                  IEEE Membership ID collected during registration.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    published: 'bg-green-100 text-green-700',
    completed: 'bg-blue-100 text-blue-700',
    cancelled: 'bg-red-100 text-red-700',
  }
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[status] || 'bg-gray-100'}`}>
      {status}
    </span>
  )
}
