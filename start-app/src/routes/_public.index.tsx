import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '@/hooks/useAuth'
import { useEventsList, useExecomList } from '@/hooks/useData'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Calendar, Users, ArrowRight, MapPin } from 'lucide-react'
import { motion } from 'framer-motion'

export const Route = createFileRoute('/_public/')({
  component: HomePage,
})

function HomePage() {
  const { user } = useAuth()
  const { data: events } = useEventsList('status = "published"')
  const { data: execom } = useExecomList()

  const latestEvent = events?.[0]
  const upcomingEvents = events?.slice(0, 3)

  return (
    <div>
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-ieee-blue py-24 md:py-32 text-white">
        <div className="container mx-auto px-6 text-center">
          <motion.h1
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8 }}
            className="text-5xl font-bold tracking-tight md:text-7xl"
          >
            IEEE Sahrdaya
          </motion.h1>
          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.8 }}
            className="mt-4 text-lg text-white/80 md:text-xl"
          >
            Student Branch — Sahrdaya College of Engineering & Technology
          </motion.p>
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="mt-8 flex justify-center gap-4"
          >
            <a href="/events">
              <Button size="lg" className="bg-white text-ieee-blue hover:bg-white/90">
                Explore Events <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </a>
            {user?.role === 'admin' || user?.role === 'chair' ? (
              <a href="/admin">
                <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10">
                  Admin Dashboard
                </Button>
              </a>
            ) : null}
          </motion.div>
        </div>
      </section>

      {/* Latest Event Teaser */}
      {latestEvent && (
        <section className="container mx-auto -mt-12 px-6 relative z-10">
          <Card className="shadow-xl">
            <CardContent className="flex flex-col md:flex-row items-center justify-between gap-4 p-6">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-ieee-blue">
                  Next Event
                </span>
                <h2 className="mt-1 text-xl font-bold">{latestEvent.title}</h2>
                <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    {new Date(latestEvent.date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {latestEvent.venue}
                  </span>
                </div>
              </div>
              <a href={`/events/${latestEvent.id}`}>
                <Button>Learn More</Button>
              </a>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Upcoming Events */}
      <section className="container mx-auto px-6 py-16">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Upcoming Events</h2>
          <a href="/events" className="text-sm text-ieee-blue hover:underline">
            View all →
          </a>
        </div>
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          {upcomingEvents?.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      </section>

      {/* Execom Section */}
      <section className="bg-muted/30 py-16">
        <div className="container mx-auto px-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Execom 2025–26</h2>
            <span className="text-sm text-muted-foreground">
              {execom?.length ?? 0} members
            </span>
          </div>
          <div className="mt-6 flex gap-4 overflow-x-auto pb-4">
            {execom?.map((member) => (
              <ExecomCard key={member.id} member={member} />
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <FooterSection />
    </div>
  )
}

function EventCard({ event }: { event: Record<string, unknown> }) {
  const title = event.title as string
  const date = event.date as string
  const venue = event.venue as string
  const price = (event.price as number) || 0

  return (
    <Card className="overflow-hidden transition-all hover:shadow-lg">
      <CardContent className="p-6">
        <h3 className="font-semibold leading-tight">{title}</h3>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            {new Date(date).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            {venue}
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm font-medium">
            {price > 0 ? `₹${price}` : 'Free'}
          </span>
          <a
            href={`/events/${event.id}`}
            className="text-sm text-ieee-blue hover:underline"
          >
            Details →
          </a>
        </div>
      </CardContent>
    </Card>
  )
}

function ExecomCard({ member }: { member: Record<string, unknown> }) {
  const name = member.name as string
  const position = member.position as string
  const photo = member.photo as string

  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="flex-shrink-0 w-48 text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-ieee-blue/10 text-xl font-bold text-ieee-blue">
        {photo ? (
          <img src={photo as string} alt={name} className="h-full w-full rounded-full object-cover" />
        ) : (
          initials
        )}
      </div>
      <h4 className="mt-3 text-sm font-semibold">{name}</h4>
      <p className="text-xs text-muted-foreground">{position}</p>
    </div>
  )
}

function FooterSection() {
  return (
    <footer className="border-t bg-background py-8">
      <div className="container mx-auto px-6">
        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          <div>
            <span className="font-bold text-ieee-blue">IEEE Sahrdaya</span>
            <p className="mt-1 text-sm text-muted-foreground">
              Advancing Technology for Humanity
            </p>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <a href="/" className="hover:text-foreground">Home</a>
            <a href="/events" className="hover:text-foreground">Events</a>
            <a href="/societies" className="hover:text-foreground">Societies</a>
          </div>
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} IEEE Sahrdaya
          </p>
        </div>
      </div>
    </footer>
  )
}
