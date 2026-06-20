// Loading spinner + ErrorBoundary utilities
import { AlertTriangle } from 'lucide-react'

export function LoadingSpinner({ className }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center ${className || ''}`}>
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-ieee-blue border-t-transparent" />
    </div>
  )
}

export function ErrorFallback({ error, reset }: { error: Error; reset?: () => void }) {
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center gap-4 p-6 text-center">
      <AlertTriangle className="h-10 w-10 text-ieee-danger" />
      <div>
        <h3 className="font-semibold">Something went wrong</h3>
        <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
      </div>
      {reset && (
        <button
          onClick={reset}
          className="rounded-md bg-ieee-blue px-4 py-2 text-sm font-medium text-white hover:bg-ieee-light-blue"
        >
          Try Again
        </button>
      )}
    </div>
  )
}
