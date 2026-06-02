'use client'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md text-center">
        <span className="text-6xl font-bold text-ieee-blue mb-4 block" role="presentation">500</span>
        <h1 className="text-xl font-semibold text-gray-800 mb-2">Something went wrong</h1>
        <p className="text-gray-600 mb-8">
          An unexpected error occurred. Please try again.
        </p>
        <button
          onClick={reset}
          className="bg-ieee-blue hover:bg-ieee-light-blue text-white px-6 py-3 rounded-lg font-semibold transition-colors"
        >
          Try Again
        </button>
      </div>
    </main>
  )
}
