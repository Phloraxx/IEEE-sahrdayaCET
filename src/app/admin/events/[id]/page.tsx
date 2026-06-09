import { Suspense } from 'react'
import { EventDetailContent } from './EventDetailContent'

export default async function EventDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params

  return (
    <div className="space-y-6">
      <Suspense fallback={<EventDetailSkeleton />}>
        <EventDetailContent eventId={id} />
      </Suspense>
    </div>
  )
}

function EventDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="h-8 w-8 rounded animate-shimmer" />
        <div>
          <div className="h-6 w-64 mb-1 rounded animate-shimmer" />
          <div className="h-4 w-32 rounded animate-shimmer" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-6">
            <div className="h-4 w-20 mb-2 rounded animate-shimmer" />
            <div className="h-7 w-12 mb-1 rounded animate-shimmer" />
            <div className="h-3 w-24 rounded animate-shimmer" />
          </div>
        ))}
      </div>
    </div>
  )
}
