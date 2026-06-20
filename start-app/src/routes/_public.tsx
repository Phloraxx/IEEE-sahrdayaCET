import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/_public')({
  component: PublicLayout,
})

function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto flex h-16 items-center justify-between px-6">
          <a href="/" className="text-xl font-bold text-ieee-blue">
            IEEE Sahrdaya
          </a>
          <nav className="flex items-center gap-6 text-sm font-medium">
            <a href="/" className="hover:text-ieee-light-blue">Home</a>
            <a href="/events" className="hover:text-ieee-light-blue">Events</a>
            <a href="/societies" className="hover:text-ieee-light-blue">Societies</a>
            <a href="/admin" className="rounded-md bg-ieee-blue px-4 py-2 text-white hover:bg-ieee-light-blue">
              Admin
            </a>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} IEEE Sahrdaya Student Branch. Sahrdaya College of Engineering & Technology.
      </footer>
    </div>
  )
}
