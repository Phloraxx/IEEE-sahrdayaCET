import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { pb } from '@/lib/pb'
import { Card, CardContent } from '@/components/ui/card'
import { Calendar, MapPin, Users } from 'lucide-react'

export const Route = createFileRoute('/_public/events')({
  component: EventsPage,
})

function EventsPage() {
  const { data: events, isLoading } = useQuery({
    queryKey: ['public-events'],
    queryFn: async () => {
      const result = await pb.collection('events').getList(1, 50, {
        filter: 'status = "published"',
        sort: 'date',
        expand: 'society',
      })
      return result.items
    },
  })

  return (
    <div className="container mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold">Upcoming Events</h1>
      <p className="mt-2 text-muted-foreground">
        {events?.length ?? 0} events
      </p>

      {isLoading ? (
        <div className="mt-8 flex justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-ieee-blue border-t-transparent" />
        </div>
      ) : (
        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {events?.map((event) => (
            <EventCard key={(event as Record<string, unknown>).id as string} event={event as Record<string, unknown>} />
          ))}
        </div>
      )}
    </div>
  )
}

function EventCard({ event }: { event: Record<string, unknown> }) {
  const id = event.id as string
  const title = event.title as string
  const date = event.date as string
  const venue = event.venue as string
  const price = (event.price as number) || 0
  const maxCapacity = event.maxCapacity as number
  const registeredCount = (event.registeredCount as number) || 0
  const expand = (event.expand as Record<string, unknown>) || {}
  const society = (expand.society as Record<string, unknown>) || {}
  const societyName = (society.name as string) || 'General'

  return (
    <Card className="overflow-hidden transition-all hover:shadow-lg">
      <CardContent className="p-6">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-ieee-blue/10 px-2 py-0.5 text-xs font-medium text-ieee-blue">
            {societyName}
          </span>
        </div>
        <h3 className="mt-2 font-semibold leading-tight">{title}</h3>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 flex-shrink-0" />
            {new Date(date).toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 flex-shrink-0" />
            {venue}
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-1 text-sm">
            <Users className="h-4 w-4" />
            <span>
              {registeredCount}
              {maxCapacity ? ` / ${maxCapacity}` : ''} registered
            </span>
          </div>
          <span className="text-sm font-medium">
            {price > 0 ? `₹${price}` : 'Free'}
          </span>
        </div>
        <a
          href={`/events/${id}`}
          className="mt-4 block text-center rounded-md bg-ieee-blue py-2 text-sm font-medium text-white hover:bg-ieee-light-blue"
        >
          View Details
        </a>
      </CardContent>
    </Card>
  )
}
