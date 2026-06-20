import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent } from '@/components/ui/card'
import { useAuth } from '@/hooks/useAuth'
import { pb } from '@/lib/pb'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { LayoutDashboard, Calendar, Ticket, Users, Settings, LogOut } from 'lucide-react'

export const Route = createFileRoute('/admin/')({
  component: AdminDashboard,
})

const navItems = [
  { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { label: 'Events', href: '/admin/events', icon: Calendar },
  { label: 'Registrations', href: '/admin/registrations', icon: Ticket },
  { label: 'Societies', href: '/admin/societies', icon: Settings },
  { label: 'Users', href: '/admin/users', icon: Users },
]

function AdminDashboard() {
  const { user, signOut } = useAuth()

  const { data: stats } = useQuery({
    queryKey: ['admin-stats', user?.id],
    queryFn: async () => {
      if (!user) return { events: 0, registrations: 0, societies: 0 }

      const isAdmin = user.role === 'admin'
      const eventFilter = isAdmin
        ? ''
        : `society.chairs ?= "${user.id}"`

      const [events, registrations, societies] = await Promise.all([
        pb.collection('events').getList(1, 1, {
          ...(eventFilter ? { filter: eventFilter } : {}),
        }),
        pb.collection('registrations').getList(1, 1, {
          filter: isAdmin
            ? 'registrationStatus = "confirmed"'
            : `event.society.chairs ?= "${user.id}" && registrationStatus = "confirmed"`,
        }),
        isAdmin
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
        <p>Redirecting...</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen">
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
            onClick={signOut}
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
            <span className="rounded-full bg-ieee-blue/10 px-2 py-0.5 text-xs font-medium text-ieee-blue">
              {user.role}
            </span>
          </div>
        </header>

        <main className="flex-1 p-8">
          <div className="space-y-6">
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

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard title="Events" value={stats?.events ?? 0} />
              <StatCard title="Registrations" value={stats?.registrations ?? 0} />
              <StatCard title="Societies" value={stats?.societies ?? 0} />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-6">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <p className="mt-2 text-3xl font-bold">{value}</p>
      </CardContent>
    </Card>
  )
}
