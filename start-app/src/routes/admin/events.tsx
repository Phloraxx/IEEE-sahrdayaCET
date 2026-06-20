import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '@/hooks/useAuth'
import { pb } from '@/lib/pb'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/ui/loading'
import { Calendar, Edit, Eye, Trash2 } from 'lucide-react'
import type { EventStatus } from '@/types'

export const Route = createFileRoute('/admin/events')({
  component: EventsPage,
})

function EventsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const { data: events, isLoading } = useQuery({
    queryKey: ['admin-events', user?.id],
    queryFn: async () => {
      const filter = isAdmin
        ? ''
        : `society.chairs ?= "${user!.id}"`

      const result = await pb.collection('events').getList(1, 50, {
        sort: '-date',
        expand: 'society',
        ...(filter ? { filter } : {}),
      })
      return result.items
    },
    enabled: !!user,
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Events</h2>
        <a href="/admin/events/new">
          <Button>
            <Calendar className="mr-2 h-4 w-4" />
            Create Event
          </Button>
        </a>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : events?.length ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Society</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Capacity</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => {
                  const e = event as Record<string, unknown>
                  const expand = (e.expand as Record<string, unknown>) || {}
                  const society = (expand.society as Record<string, unknown>) || {}
                  return (
                    <TableRow key={e.id as string}>
                      <TableCell className="font-medium">{e.title as string}</TableCell>
                      <TableCell>{(society.name as string) || '-'}</TableCell>
                      <TableCell>{new Date(e.date as string).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <EventStatusBadge status={e.status as EventStatus} />
                      </TableCell>
                      <TableCell>
                        {(e.registeredCount as number) || 0}
                        {e.maxCapacity ? ` / ${e.maxCapacity}` : ''}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <a href={`/admin/events/${e.id}`}>
                            <Eye className="h-4 w-4 text-muted-foreground hover:text-ieee-blue" />
                          </a>
                          <a href={`/admin/events/${e.id}/edit`}>
                            <Edit className="h-4 w-4 text-muted-foreground hover:text-ieee-blue" />
                          </a>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No events found.
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function EventStatusBadge({ status }: { status: EventStatus }) {
  const variants: Record<EventStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    draft: 'outline',
    published: 'default',
    completed: 'secondary',
    cancelled: 'destructive',
  }
  return <Badge variant={variants[status] || 'outline'}>{status}</Badge>
}
