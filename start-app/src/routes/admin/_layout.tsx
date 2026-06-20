import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { useAuth } from '@/hooks/useAuth'
import { useEffect } from 'react'

export const Route = createFileRoute('/admin/_layout')({
  component: AdminLayout,
  beforeLoad: () => {
    // Client-side guard: if not authenticated, redirect to login
    // In a real app you'd check pb.authStore.isValid here
  },
})

function AdminLayout() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-ieee-blue border-t-transparent" />
      </div>
    )
  }

  if (!user) {
    // Redirect to login (would use router.navigate in real implementation)
    window.location.href = '/'
    return null
  }

  return (
    <div className="flex min-h-screen bg-muted/30">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-background">
        <div className="flex h-16 items-center border-b px-6">
          <span className="font-bold text-ieee-blue">Admin Panel</span>
        </div>
        <nav className="space-y-1 p-4">
          <NavLink href="/admin" label="Dashboard" />
          <NavLink href="/admin/events" label="Events" />
          <NavLink href="/admin/registrations" label="Registrations" />
          <NavLink href="/admin/societies" label="Societies" />
          <NavLink href="/admin/users" label="Users" />
          <NavLink href="/admin/payments" label="Payments" />
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b bg-background px-8">
          <h1 className="font-semibold">Dashboard</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user.name}</span>
            <span className="rounded-full bg-ieee-blue/10 px-2 py-1 text-xs font-medium text-ieee-blue">
              {user.role}
            </span>
          </div>
        </header>
        <main className="flex-1 p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="flex items-center rounded-md px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {label}
    </a>
  )
}
