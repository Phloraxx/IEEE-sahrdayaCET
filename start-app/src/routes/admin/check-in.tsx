import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '@/hooks/useAuth'
import { pb } from '@/lib/pb'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LoadingSpinner } from '@/components/ui/loading'
import { QrCode } from 'lucide-react'

export const Route = createFileRoute('/admin/check-in')({
  component: CheckInEventsPage,
})

function CheckInEventsPage() {
  const { user, isAdmin } = useAuth()

  const { data: events, isLoading } = useQuery({
    queryKey: ['check-in-events', user?.id],
    queryFn: async () => {
      const filter = isAdmin
        ? 'checkInEnabled = true'
        : `checkInEnabled = true && society.chairs ?= "${user!.id}"`

      const result = await pb.collection('events').getList(1, 20, {
        sort: '-date',
        expand: 'society',
        filter,
      })
      return result.items
    },
    enabled: !!user,
  })

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Check-In</h2>
      <p className="text-muted-foreground">Select an event to start checking in attendees.</p>

      {isLoading ? <LoadingSpinner /> : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(events as Record<string, unknown>[])?.map((event) => {
            const expand = (event.expand as Record<string, unknown>) || {}
            const society = (expand.society as Record<string, unknown>) || {}
            const registeredCount = (event.registeredCount as number) || 0
            const checkedInCount = (event.checkedInCount as number) || 0

            return (
              <Card key={event.id as string} className="transition-all hover:shadow-lg">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline">{(society.name as string) || 'General'}</Badge>
                    {registeredCount > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {checkedInCount}/{registeredCount} checked in
                      </span>
                    )}
                  </div>
                  <h3 className="mt-2 font-semibold">{event.title as string}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {new Date(event.date as string).toLocaleDateString()}
                  </p>
                  <a
                    href={`/admin/check-in/${event.id}`}
                    className="mt-4 flex items-center justify-center gap-2 rounded-md bg-ieee-blue py-2 text-sm font-medium text-white hover:bg-ieee-light-blue"
                  >
                    <QrCode className="h-4 w-4" />
                    Open Check-In
                  </a>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
