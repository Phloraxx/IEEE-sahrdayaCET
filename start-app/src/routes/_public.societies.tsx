import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { pb } from '@/lib/pb'
import { Card, CardContent } from '@/components/ui/card'

export const Route = createFileRoute('/_public/societies')({
  component: SocietiesPage,
})

function SocietiesPage() {
  const { data: societies, isLoading } = useQuery({
    queryKey: ['societies'],
    queryFn: async () => {
      const result = await pb.collection('societies').getFullList({
        filter: 'isHidden = false',
        sort: 'name',
      })
      return result
    },
  })

  return (
    <div className="container mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold">Technical Societies</h1>
      <p className="mt-2 text-muted-foreground">
        {societies?.length ?? 0} societies under IEEE Sahrdaya
      </p>

      {isLoading ? (
        <div className="mt-8 flex justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-ieee-blue border-t-transparent" />
        </div>
      ) : (
        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {societies?.map((s) => {
            const society = s as Record<string, unknown>
            return <SocietyCard key={society.id as string} society={society} />
          })}
        </div>
      )}
    </div>
  )
}

function SocietyCard({ society }: { society: Record<string, unknown> }) {
  const name = society.name as string
  const slug = society.slug as string
  const bio = society.bio as string
  const logo = society.logo as string

  const initials = name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase()

  return (
    <Card className="overflow-hidden transition-all hover:shadow-lg">
      <CardContent className="flex flex-col items-center p-6 text-center">
        {logo ? (
          <img
            src={`https://db.phloraxx.us.to/api/files/societies/${society.id}/${logo}`}
            alt={name}
            className="h-16 w-16 object-contain"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-ieee-blue/10 text-xl font-bold text-ieee-blue">
            {initials}
          </div>
        )}
        <h3 className="mt-4 font-semibold">{name}</h3>
        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{bio}</p>
        <a
          href={`/societies/${slug}`}
          className="mt-4 text-sm text-ieee-blue hover:underline"
        >
          Learn more →
        </a>
      </CardContent>
    </Card>
  )
}
