import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '@/hooks/useAuth'
import { pb } from '@/lib/pb'
import { useQuery } from '@tanstack/react-query'
import { Calendar, Users, Ticket, TrendingUp } from 'lucide-react'

export const Route = createFileRoute('/admin/')({
  component: AdminDashboard,
})

function AdminDashboard() {
  const { user, isAdmin } = useAuth()

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats', user?.id],
    queryFn: async () => {
      const eventFilter = isAdmin
        ? ''
        : `society.chairs ?= "${user!.id}"`

      const [events, registrations, societies] = await Promise.all([
        pb.collection('events').getList(1, 1, {
          ...(eventFilter ? { filter: eventFilter } : {}),
        }),
        pb.collection('registrations').getList(1, 1, {
          filter: isAdmin
            ? 'registrationStatus = "confirmed"'
            : `event.society.chairs ?= "${user!.id}" && registrationStatus = "confirmed"`,
        }),
        isAdmin
          ? pb.collection('societies').getList(1, 1)
          : Promise.resolve({ totalItems: 0 }),
      ])

      return {
        totalEvents: events.totalItems,
        totalRegistrations: registrations.totalItems,
        totalSocieties: societies.totalItems,
      }
    },
    enabled: !!user,
  })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">
          Good {getTimeOfDay()}, {user?.name?.split(' ')[0] ?? 'there'}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Events"
          value={stats?.totalEvents ?? 0}
          icon={<Calendar className="h-5 w-5" />}
        />
        <StatCard
          title="Registrations"
          value={stats?.totalRegistrations ?? 0}
          icon={<Ticket className="h-5 w-5" />}
        />
        <StatCard
          title="Societies"
          value={stats?.totalSocieties ?? 0}
          icon={<Users className="h-5 w-5" />}
        />
        <StatCard
          title="Growth"
          value="+12%"
          icon={<TrendingUp className="h-5 w-5" />}
        />
      </div>

      <div className="rounded-lg border bg-card p-6">
        <h3 className="font-semibold">Quick Actions</h3>
        <div className="mt-4 flex gap-3">
          <a
            href="/admin/events/new"
            className="inline-flex items-center rounded-md bg-ieee-blue px-4 py-2 text-sm font-medium text-white hover:bg-ieee-light-blue"
          >
            Create Event
          </a>
          <a
            href="/admin/registrations"
            className="inline-flex items-center rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            View Registrations
          </a>
        </div>
      </div>
    </div>
  )
}

function StatCard({
  title,
  value,
  icon,
}: {
  title: string
  value: string | number
  icon: React.ReactNode
}) {
  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-sm font-medium">{title}</span>
      </div>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </div>
  )
}

function getTimeOfDay() {
  const hour = new Date().getHours()
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}
