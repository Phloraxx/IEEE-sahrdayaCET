const isProduction = process.env.NODE_ENV === 'production'

export function logError(context: string, error: unknown, meta?: Record<string, unknown>) {
  const message = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error ? error.stack : undefined
  if (isProduction) {
    console.log(JSON.stringify({ level: 'error', context, message, stack, ...meta }))
  } else {
    console.error(`[${context}]`, message)
  }
}
