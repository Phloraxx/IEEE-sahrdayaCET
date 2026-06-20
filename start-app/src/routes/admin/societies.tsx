import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '@/hooks/useAuth'
import { pb } from '@/lib/pb'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LoadingSpinner } from '@/components/ui/loading'

export const Route = createFileRoute('/admin/societies')({
  component: SocietiesPage,
})

function SocietiesPage() {
  const { data: societies, isLoading } = useQuery({
    queryKey: ['admin-societies'],
    queryFn: async () => pb.collection('societies').getFullList(1, 50, { expand: 'chairs' }),
  })

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Societies</h2>
      {isLoading ? <LoadingSpinner /> : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {societies?.map((s: Record<string, unknown>) => (
            <Card key={s.id as string}>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ieee-blue/10 text-lg font-bold text-ieee-blue">
                    {(s.name as string)?.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-semibold">{s.name as string}</h3>
                    <p className="text-xs text-muted-foreground">{s.slug as string}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted-foreground line-clamp-2">{s.bio as string}</p>
                {s.isHidden && <Badge variant="destructive" className="mt-2">Hidden</Badge>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
