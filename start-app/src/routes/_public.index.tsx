import { createFileRoute } from '@tanstack/react-router'
import { pb } from '@/lib/pb'
import { useQuery } from '@tanstack/react-query'

export const Route = createFileRoute('/_public/')({
  component: HomePage,
})

function HomePage() {
  const { data: latestEvent } = useQuery({
    queryKey: ['latest-event'],
    queryFn: async () => {
      const result = await pb.collection('events').getList(1, 1, {
        sort: '-date',
        filter: 'status = "published"',
      })
      return result.items[0]
    },
  })

  return (
    <div>
      {/* Hero */}
      <section className="bg-ieee-blue py-24 text-white">
        <div className="container mx-auto px-6 text-center">
          <h1 className="text-4xl font-bold md:text-6xl">IEEE Sahrdaya</h1>
          <p className="mt-4 text-lg text-white/80">
            Student Branch — Sahrdaya College of Engineering & Technology
          </p>
          <div className="mt-8">
            <a
              href="/events"
              className="inline-flex rounded-md bg-white px-6 py-3 font-medium text-ieee-blue hover:bg-white/90"
            >
              Explore Events
            </a>
          </div>
        </div>
      </section>

      {/* Upcoming Event Banner */}
      {latestEvent && (
        <section className="container mx-auto -mt-8 px-6">
          <div className="rounded-xl border bg-card p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-medium uppercase tracking-wide text-ieee-blue">
                  Next Event
                </span>
                <h2 className="mt-1 text-xl font-bold">{latestEvent.title as string}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {new Date(latestEvent.date as string).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
              <a
                href={`/events/${latestEvent.id}`}
                className="rounded-md bg-ieee-blue px-4 py-2 text-sm font-medium text-white"
              >
                Learn More
              </a>
            </div>
          </div>
        </section>
      )}

      {/* Societies teaser */}
      <section className="container mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold">14 Technical Societies</h2>
        <p className="mt-2 text-muted-foreground">
          From Computer Society to Robotics & Automation — find your community.
        </p>
        <a href="/societies" className="mt-4 inline-block text-ieee-blue hover:underline">
          View all societies →
        </a>
      </section>
    </div>
  )
}
