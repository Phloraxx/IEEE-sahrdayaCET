import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useAuth } from '@/hooks/useAuth'
import { pb } from '@/lib/pb'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LoadingSpinner } from '@/components/ui/loading'
import { LayoutDashboard, Calendar, Ticket, QrCode, IndianRupee, Users, Settings, LogOut, Plus } from 'lucide-react'
import { toast } from 'sonner'

export const Route = createFileRoute('/admin/')({
  component: AdminDashboard,
})

const navItems = [
  { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { label: 'Events', href: '/admin/events', icon: Calendar },
  { label: 'Registrations', href: '/admin/registrations', icon: Ticket },
  { label: 'Check-In', href: '/admin/check-in', icon: QrCode },
  { label: 'Payments', href: '/admin/payments', icon: IndianRupee },
  { label: 'Users', href: '/admin/users', icon: Users },
  { label: 'Societies', href: '/admin/societies', icon: Settings },
]

function AdminDashboard() {
  const { user, signOut, isAdmin } = useAuth()

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['admin-stats', user?.id],
    queryFn: async () => {
      if (!user) return { events: 0, registrations: 0, societies: 0, checkIns: 0, revenue: 0 }

      const isAdminRole = user.role === 'admin'
      const eventFilter = isAdminRole ? '' : `society.chairs ?= "${user.id}"`

      const [events, registrations, societies] = await Promise.all([
        pb.collection('events').getList(1, 1, {
          ...(eventFilter ? { filter: eventFilter } : {}),
        }),
        pb.collection('registrations').getList(1, 1, {
          filter: isAdminRole
            ? 'registrationStatus = "confirmed"'
            : `event.society.chairs ?= "${user.id}" && registrationStatus = "confirmed"`,
        }),
        isAdminRole
          ? pb.collection('societies').getList(1, 1)
          : Promise.resolve({ totalItems: 0 }),
      ])

      return {
        events: events.totalItems,
        registrations: registrations.totalItems,
        societies: societies.totalItems,
      }
    },
    enabled: !!user,
  })

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-muted/30">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-background">
        <div className="flex h-16 items-center border-b px-6">
          <span className="font-bold text-ieee-blue">Admin Panel</span>
        </div>
        <nav className="space-y-1 p-4">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <a
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-md px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </a>
            )
          })}
        </nav>
        <div className="absolute bottom-0 w-64 border-t p-4">
          <button
            onClick={() => {
              signOut()
              toast.info('Signed out')
              window.location.href = '/'
            }}
            className="flex w-full items-center gap-3 rounded-md px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b bg-background px-8">
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm">{user.name}</span>
            <Badge variant="outline" className="text-xs">
              {user.role}
            </Badge>
          </div>
        </header>

        <main className="flex-1 p-8">
          <div className="space-y-8">
            {/* Welcome */}
            <div>
              <h2 className="text-2xl font-bold">
                Welcome back, {user.name?.split(' ')[0]}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {new Date().toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
            </div>

            {/* Stats */}
            {statsLoading ? <LoadingSpinner /> : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard title="Events" value={stats?.events ?? 0} />
                <StatCard title="Registrations" value={stats?.registrations ?? 0} />
                <StatCard title="Societies" value={stats?.societies ?? 0} />
                <StatCard title="Quick Action">
                  <a href="/admin/events/new">
                    <Button className="w-full" size="sm">
                      <Plus className="mr-2 h-4 w-4" />
                      Create Event
                    </Button>
                  </a>
                </StatCard>
              </div>
            )}

            {/* Recent activity placeholder */}
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold">Getting Started</h3>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <a href="/admin/events" className="rounded-lg border p-4 hover:bg-muted transition-colors">
                    <Calendar className="h-6 w-6 text-ieee-blue" />
                    <p className="mt-2 font-medium">Manage Events</p>
                    <p className="text-sm text-muted-foreground">Create, edit, and track events</p>
                  </a>
                  <a href="/admin/registrations" className="rounded-lg border p-4 hover:bg-muted transition-colors">
                    <Ticket className="h-6 w-6 text-ieee-blue" />
                    <p className="mt-2 font-medium">View Registrations</p>
                    <p className="text-sm text-muted-foreground">See who signed up for events</p>
                  </a>
                  <a href="/admin/check-in" className="rounded-lg border p-4 hover:bg-muted transition-colors">
                    <QrCode className="h-6 w-6 text-ieee-blue" />
                    <p className="mt-2 font-medium">Check-In Attendees</p>
                    <p className="text-sm text-muted-foreground">Scan tickets at the venue</p>
                  </a>
                  <a href="/admin/payments" className="rounded-lg border p-4 hover:bg-muted transition-colors">
                    <IndianRupee className="h-6 w-6 text-ieee-blue" />
                    <p className="mt-2 font-medium">Track Payments</p>
                    <p className="text-sm text-muted-foreground">View revenue and transactions</p>
                  </a>
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  )
}

function StatCard({ title, value, children }: { title: string; value?: number; children?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-6">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        {value !== undefined ? (
          <p className="mt-2 text-3xl font-bold">{value}</p>
        ) : (
          <div className="mt-2">{children}</div>
        )}
      </CardContent>
    </Card>
  )
}
