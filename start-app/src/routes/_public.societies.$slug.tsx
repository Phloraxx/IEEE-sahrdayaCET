import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { pb } from '@/lib/pb'
import { Card, CardContent } from '@/components/ui/card'
import { LoadingSpinner } from '@/components/ui/loading'
import { Calendar, ArrowLeft } from 'lucide-react'

export const Route = createFileRoute('/_public/societies/$slug')({
  component: SocietyDetailPage,
})

function SocietyDetailPage() {
  const { slug } = Route.useParams()

  const { data: society, isLoading: societyLoading } = useQuery({
    queryKey: ['society', slug],
    queryFn: async () => {
      const result = await pb.collection('societies').getList(1, 1, {
        filter: `slug = "${slug}"`,
      })
      return result.items[0]
    },
  })

  const societyId = (society as Record<string, unknown>)?.id as string

  const { data: events } = useQuery({
    queryKey: ['society-events', societyId],
    queryFn: async () => {
      const result = await pb.collection('events').getList(1, 20, {
        filter: `society = "${societyId}" && status = "published"`,
        sort: '-date',
      })
      return result.items
    },
    enabled: !!societyId,
  })

  if (societyLoading) return <LoadingSpinner />
  if (!society) {
    return (
      <div className="container mx-auto px-6 py-16 text-center">
        <h1 className="text-2xl font-bold">Society not found</h1>
        <a href="/societies" className="mt-4 inline-block text-ieee-blue hover:underline">← All societies</a>
      </div>
    )
  }

  const s = society as Record<string, unknown>
  const name = s.name as string
  const bio = s.bio as string

  return (
    <div className="container mx-auto px-6 py-16">
      <a href="/societies" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to societies
      </a>

      <div className="mt-6">
        <h1 className="text-3xl font-bold">{name}</h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">{bio}</p>
      </div>

      <div className="mt-12">
        <h2 className="text-xl font-bold">Events</h2>
        <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {events?.map((event: Record<string, unknown>) => (
            <Card key={event.id as string}>
              <CardContent className="p-6">
                <h3 className="font-semibold">{event.title as string}</h3>
                <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  {new Date(event.date as string).toLocaleDateString()}
                </div>
                <a
                  href={`/events/${event.id}`}
                  className="mt-4 inline-block text-sm text-ieee-blue hover:underline"
                >
                  View event →
                </a>
              </CardContent>
            </Card>
          ))}
          {!events?.length && (
            <p className="text-muted-foreground">No upcoming events.</p>
          )}
        </div>
      </div>
    </div>
  )
}
