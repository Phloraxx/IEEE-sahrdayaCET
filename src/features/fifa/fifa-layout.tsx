import { Link } from '@tanstack/react-router'
import { useAuth } from '@/lib/auth-context'

// Shared layout for the public FIFA pages. Simple top nav, no sidebar.
// The admin FIFA pages use the existing admin.tsx layout instead.
export function FifaLayout({ active, children }: { active: 'home' | 'matches' | 'leaderboard' | 'feed' | 'dashboard'; children: React.ReactNode }) {
  const { status, signIn } = useAuth()

  const navItems = [
    { key: 'home', label: 'Overview', to: '/FIFA/' as const },
    { key: 'matches', label: 'Matches', to: '/FIFA/matches/' as const },
    { key: 'leaderboard', label: 'Leaderboard', to: '/FIFA/leaderboard/' as const },
    { key: 'feed', label: 'Feed', to: '/FIFA/feed/' as const },
  ] as const

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-[1020] border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link to="/FIFA/" className="font-display text-lg text-ieee-blue leading-none">
            WC Predict '26
          </Link>
          <nav className="flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.key}
                to={item.to}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  active === item.key
                    ? 'bg-ieee-blue text-white'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                {item.label}
              </Link>
            ))}
            {status === 'authenticated' ? (
              <Link
                to="/FIFA/dashboard/"
                className={`ml-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  active === 'dashboard' ? 'bg-ieee-blue text-white' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                Dashboard
              </Link>
            ) : (
              <button
                onClick={signIn}
                className="ml-1 px-3 py-1.5 rounded-md text-sm font-medium bg-ieee-light-blue text-white hover:bg-ieee-blue transition-colors"
              >
                Sign in
              </button>
            )}
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  )
}
