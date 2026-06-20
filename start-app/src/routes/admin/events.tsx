import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '@/hooks/useAuth'
import { pb } from '@/lib/pb'
import { useQuery } from '@tanstack/react-query'
import type { Event, EventStatus } from '@/types'

export const Route = createFileRoute('/admin/events')({
  component: EventsPage,
})

function EventsPage() {
  const { isAdmin, user } = useAuth()

  const { data: events, isLoading } = useQuery({
    queryKey: ['admin-events', user?.id],
    queryFn: async () => {
      const filter = isAdmin
        ? ''
        : `society.chairs ?= "${user!.id}"`

      const result = await pb.collection('events').getList<Event>(1, 20, {
        sort: '-date',
        expand: 'society',
        ...(filter && { filter }),
      })
      return result.items
    },
    enabled: !!user,
  })

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-ieee-blue border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Events</h2>
        <a
          href="/admin/events/new"
          className="inline-flex items-center rounded-md bg-ieee-blue px-4 py-2 text-sm font-medium text-white hover:bg-ieee-light-blue"
        >
          Create Event
        </a>
      </div>

      {events?.length ? (
        <div className="rounded-md border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-muted-foreground">
                <th className="px-4 py-3 text-left font-medium">Title</th>
                <th className="px-4 py-3 text-left font-medium">Date</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Capacity</th>
                <th className="px-4 py-3 text-left font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {events.map((event) => (
                <tr key={event.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{event.title}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(event.date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={event.status} />
                  </td>
                  <td className="px-4 py-3">
                    {event.registeredCount}
                    {event.maxCapacity ? ` / ${event.maxCapacity}` : ''}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={`/admin/events/${event.id}`}
                      className="text-sm text-ieee-blue hover:underline"
                    >
                      View
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-md border p-12 text-center text-muted-foreground">
          No events found. Create your first event above.
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: EventStatus }) {
  const styles: Record<EventStatus, string> = {
    draft: 'bg-gray-100 text-gray-700',
    published: 'bg-green-100 text-green-700',
    completed: 'bg-blue-100 text-blue-700',
    cancelled: 'bg-red-100 text-red-700',
  }

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  )
}
