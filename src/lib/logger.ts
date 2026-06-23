const isProduction = process.env.NODE_ENV === 'production'

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function logError(context: string, error: unknown, meta?: Record<string, unknown>) {
  const message = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error ? error.stack : undefined
  if (isProduction) {
    console.error(safeStringify({ level: 'error', context, message, stack, ...meta }))
  } else {
    console.error(`[${context}]`, message)
  }
}
