import { Suspense } from 'react'
import { PaymentsContent } from './PaymentsContent'

export default function PaymentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Payments</h1>
        <p className="text-sm text-muted-foreground mt-1">Track registration payments and revenue.</p>
      </div>
      <Suspense fallback={<div className="animate-shimmer rounded-xl h-64 w-full" />}>
        <PaymentsContent />
      </Suspense>
    </div>
  )
}