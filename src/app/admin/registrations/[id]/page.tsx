import { Suspense } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { RegistrationDetailClient } from '../RegistrationDetailClient'
import { Skeleton } from '@/components/ui/skeleton'

function RegDetailSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card p-6 space-y-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-40" />
        </div>
      ))}
    </div>
  )
}

export default async function RegistrationDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <Link href="/admin/registrations" className="inline-flex items-center justify-center rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted transition-colors">
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Registration</h1>
          <p className="text-sm text-muted-foreground mt-1">Registration details</p>
        </div>
      </div>

      <Suspense fallback={<RegDetailSkeleton />}>
        <RegistrationDetailClient id={id} />
      </Suspense>
    </div>
  )
}
