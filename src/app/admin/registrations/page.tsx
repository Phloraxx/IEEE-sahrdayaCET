import { Suspense } from 'react'
import { RegistrationsContent } from './RegistrationsContent'

export default function RegistrationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Registrations</h1>
        <p className="text-sm text-muted-foreground mt-1">
          View and manage event registrations.
        </p>
      </div>
      <Suspense fallback={<RegSkeleton />}>
        <RegistrationsContent />
      </Suspense>
    </div>
  )
}

function RegSkeleton() {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Filter bar skeleton */}
      <div className="p-3 flex items-center gap-2 border-b border-border/50">
        <div className="animate-shimmer rounded-md h-8 flex-1" />
        <div className="animate-shimmer rounded-md h-8 w-28" />
        <div className="animate-shimmer rounded-md h-8 w-28" />
        <div className="animate-shimmer rounded-md h-8 w-28" />
      </div>
      {/* Table skeleton */}
      <div className="p-4 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="animate-shimmer rounded-full h-10 w-10" />
            <div className="flex-1 space-y-1">
              <div className="animate-shimmer rounded-md h-4 w-40" />
              <div className="animate-shimmer rounded-md h-3 w-56" />
            </div>
            <div className="animate-shimmer rounded-full h-5 w-16" />
            <div className="animate-shimmer rounded-md h-4 w-16" />
          </div>
        ))}
      </div>
      {/* Footer skeleton */}
      <div className="border-t border-border/50 p-3">
        <div className="animate-shimmer rounded-md h-4 w-48" />
      </div>
    </div>
  )
}
